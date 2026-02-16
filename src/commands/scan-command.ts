import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
	ensureHomeRepoStructure,
	importDiscoveredAssetToHome,
	listGitTrackedFiles,
	listHomePromptIds,
	listHomeSkillIds,
	scanUnsyncedAssets,
} from "../core/assets.js";
import { defaultScanSources, expandTilde, type ScanSource } from "../core/config.js";
import { buildScanConflicts, type ScanConflict } from "../core/scan-conflicts.js";
import type { AssetKind, DiscoveredAsset } from "../core/types.js";
import { styleCommand, styleHint, styleLabel } from "../ui/brand.js";

type ScanOptions = {
	home?: string;
	json?: boolean;
	sources: string[];
	sync?: boolean;
	syncAll?: boolean;
	syncSelect: string[];
	force?: boolean;
	sourcesFull?: boolean;
	diff?: boolean;
	diffFull?: boolean;
	explainConflicts?: boolean;
	sourceOnly?: boolean;
};

type ScanState = "synced-tracked" | "synced-untracked" | "unsynced-untracked";

type ScanStatusItem = {
	kind: AssetKind;
	id: string;
	sources: string[];
	state: ScanState;
};

export async function runScanCommand(args: string[]): Promise<number> {
	const options = parseScanArgs(args);
	if (options.help) {
		printScanHelp();
		return 0;
	}
	if (options.syncAll && options.syncSelect.length > 0) {
		throw new Error("Cannot combine --sync-all with --sync-select.");
	}

	const home = await ensureHomeRepoStructure(options.home);
	const configuredSources = options.sourceOnly
		? buildExplicitSources(options.sources)
		: await defaultScanSources(options.sources);
	const sources = options.sourceOnly
		? dedupeSourcesByRoot(configuredSources)
		: withProjectSource(configuredSources);
	const sourceRoots = sources.map((source) => source.root);
	const activeSourceRoots = await listExistingDirectories(sourceRoots);
	const report = await scanUnsyncedAssets({
		home,
		sources,
	});
	const [homePromptIds, homeSkillIds, trackedFiles] = await Promise.all([
		listHomePromptIds(home),
		listHomeSkillIds(home),
		listGitTrackedFiles(home),
	]);
	const statusItems = buildScanStatusItems({
		discovered: [...report.discoveredPrompts, ...report.discoveredSkills],
		homePromptIds,
		homeSkillIds,
		trackedFiles,
	});
	const conflicts = await buildScanConflicts({
		home,
		discoveredAssets: [...report.discoveredPrompts, ...report.discoveredSkills],
		trackedFiles,
		includeDiff: Boolean(options.diff || options.diffFull),
		includeDiffFull: Boolean(options.diffFull),
	});
	const conflictById = new Map<string, ScanConflict>(
		conflicts.map((conflict) => [`${conflict.kind}:${conflict.id}`, conflict]),
	);
	const statusItemsWithConflicts = statusItems.map((item) => ({
		...item,
		conflict: conflictById.get(`${item.kind}:${item.id}`),
	}));

	if (options.json) {
		process.stdout.write(
			`${JSON.stringify({ ...report, statuses: statusItemsWithConflicts, conflicts }, null, 2)}\n`,
		);
		return report.unsyncedPrompts.length + report.unsyncedSkills.length > 0 ? 1 : 0;
	}

	process.stdout.write(`${pc.bold("dotagents scan")}\n`);
	process.stdout.write(`${styleLabel("home")}: ${pc.cyan(report.home)}\n`);
	process.stdout.write(
		`${styleLabel("sources")}: ${formatSourcesSummary(sourceRoots, activeSourceRoots, options.sourcesFull)}\n\n`,
	);

	printStatusSection(
		"Synced + git tracked",
		statusItemsWithConflicts.filter((item) => item.state === "synced-tracked"),
		pc.green("●"),
	);
	printStatusSection(
		"Synced + untracked in home git",
		statusItemsWithConflicts.filter((item) => item.state === "synced-untracked"),
		pc.yellow("●"),
	);
	printStatusSection(
		"Unsynced (missing from home)",
		statusItemsWithConflicts.filter((item) => item.state === "unsynced-untracked"),
		pc.red("●"),
	);
	if (statusItemsWithConflicts.length === 0) {
		process.stdout.write(`\n${styleHint("No assets discovered in configured scan sources.")}\n`);
		return 0;
	}
	const shouldExplainConflicts =
		Boolean(options.explainConflicts) ||
		Boolean(options.diff) ||
		Boolean(options.diffFull) ||
		Boolean(process.stdout.isTTY);
	if (shouldExplainConflicts) {
		printConflictSection(conflicts, Boolean(options.diffFull));
	}

	const unsyncedAssets = [...report.unsyncedPrompts, ...report.unsyncedSkills];
	if (options.syncAll) {
		return await syncSelectedAssets(
			home,
			unsyncedAssets,
			Boolean(options.force),
			null,
			conflictById,
		);
	}
	if (options.syncSelect.length > 0) {
		return await syncSelectedAssets(
			home,
			unsyncedAssets,
			Boolean(options.force),
			new Set(options.syncSelect),
			conflictById,
		);
	}

	const shouldPromptSync = options.sync || (Boolean(process.stdout.isTTY) && !options.json);
	if (shouldPromptSync) {
		return await promptAndSyncUnsynced(home, unsyncedAssets, options.force, conflictById);
	}

	if (report.unsyncedPrompts.length === 0 && report.unsyncedSkills.length === 0) {
		process.stdout.write(`\n${pc.green("All discovered assets are synced.")}\n`);
		return 0;
	}

	return 1;
}

async function promptAndSyncUnsynced(
	home: string,
	assets: DiscoveredAsset[],
	force = false,
	conflictById?: Map<string, ScanConflict>,
): Promise<number> {
	if (assets.length === 0) {
		return 0;
	}

	const selected = await p.multiselect({
		message: "Select unsynced assets to import into home repo",
		options: assets.map((asset) => ({
			value: `${asset.kind}:${asset.id}:${asset.path}`,
			label: `[${asset.kind}] ${asset.id}  (${asset.source})`,
			hint:
				conflictById?.get(`${asset.kind}:${asset.id}`)?.state === "ambiguous-multi-source"
					? `conflict: ambiguous-multi-source`
					: asset.path,
		})),
	});
	if (p.isCancel(selected)) {
		p.cancel("Canceled sync.");
		return 130;
	}
	if (selected.length === 0) {
		process.stdout.write(`${styleHint("No assets selected for sync.")}\n`);
		return 1;
	}

	const chosen = new Set(selected);
	return await syncSelectedAssets(home, assets, force, chosen, conflictById);
}

async function syncSelectedAssets(
	home: string,
	assets: DiscoveredAsset[],
	force: boolean,
	selection: Set<string> | null,
	conflictById?: Map<string, ScanConflict>,
): Promise<number> {
	const targets =
		selection === null
			? assets
			: assets.filter((asset) => selection.has(`${asset.kind}:${asset.id}:${asset.path}`));

	if (selection !== null && targets.length === 0) {
		process.stdout.write(`${styleHint("No matching unsynced assets selected for sync.")}\n`);
		return 1;
	}

	let failures = 0;
	for (const asset of targets) {
		const conflict = conflictById?.get(`${asset.kind}:${asset.id}`);
		if (conflict && conflict.state !== "no-conflict") {
			process.stdout.write(
				`${pc.yellow("Warning")} [${asset.kind}] ${asset.id}: ${conflict.state} — ${conflict.recommendation}\n`,
			);
		}
		try {
			const targetPath = await importDiscoveredAssetToHome({ home, asset, force });
			process.stdout.write(
				`${pc.green("Synced")} ${styleCommand(`[${asset.kind}] ${asset.id}`)} ${styleHint("->")} ${targetPath}\n`,
			);
		} catch (error) {
			failures += 1;
			process.stdout.write(
				`${pc.red("Failed")} [${asset.kind}] ${asset.id}: ${
					error instanceof Error ? error.message : String(error)
				}\n`,
			);
		}
	}
	return failures > 0 ? 1 : 0;
}

function buildScanStatusItems(input: {
	discovered: DiscoveredAsset[];
	homePromptIds: Set<string>;
	homeSkillIds: Set<string>;
	trackedFiles: Set<string>;
}): ScanStatusItem[] {
	const byAsset = new Map<string, { kind: AssetKind; id: string; sources: Set<string> }>();
	for (const asset of input.discovered) {
		const key = `${asset.kind}:${asset.id}`;
		const existing = byAsset.get(key);
		if (existing) {
			existing.sources.add(asset.source);
			continue;
		}
		byAsset.set(key, {
			kind: asset.kind,
			id: asset.id,
			sources: new Set([asset.source]),
		});
	}

	const trackedSkillFiles = [...input.trackedFiles].filter((file) => file.startsWith("skills/"));
	const trackedPromptIds = new Set(
		[...input.homePromptIds].filter((id) => input.trackedFiles.has(`prompts/${id}.md`)),
	);
	const trackedSkillIds = new Set(
		[...input.homeSkillIds].filter((id) =>
			trackedSkillFiles.some((file) => file.startsWith(`skills/${id}/`)),
		),
	);

	const items: ScanStatusItem[] = [];
	for (const item of byAsset.values()) {
		if (item.kind === "prompt") {
			if (!input.homePromptIds.has(item.id)) {
				items.push({
					...item,
					sources: [...item.sources].sort(),
					state: "unsynced-untracked",
				});
				continue;
			}
			items.push({
				...item,
				sources: [...item.sources].sort(),
				state: trackedPromptIds.has(item.id) ? "synced-tracked" : "synced-untracked",
			});
			continue;
		}

		if (!input.homeSkillIds.has(item.id)) {
			items.push({
				...item,
				sources: [...item.sources].sort(),
				state: "unsynced-untracked",
			});
			continue;
		}
		items.push({
			...item,
			sources: [...item.sources].sort(),
			state: trackedSkillIds.has(item.id) ? "synced-tracked" : "synced-untracked",
		});
	}

	return items.sort(
		(left, right) =>
			left.kind.localeCompare(right.kind) ||
			left.id.localeCompare(right.id) ||
			left.sources.join(",").localeCompare(right.sources.join(",")),
	);
}

function printStatusSection(title: string, items: ScanStatusItem[], dot: string): void {
	if (items.length === 0) {
		return;
	}
	process.stdout.write(`${pc.bold(title)} ${styleHint(`(${items.length})`)}\n`);
	for (const item of items) {
		process.stdout.write(
			`  ${dot} ${styleCommand(`[${item.kind}]`)} ${styleCommand(item.id)} ${styleHint(`[${item.sources.join(", ")}]`)}\n`,
		);
	}
	process.stdout.write("\n");
}

function printConflictSection(conflicts: ScanConflict[], showFullDiff: boolean): void {
	const relevant = conflicts.filter((conflict) => conflict.state !== "no-conflict");
	if (relevant.length === 0) {
		return;
	}
	process.stdout.write(
		`${pc.bold("Conflict explanations")} ${styleHint(`(${relevant.length})`)}\n`,
	);
	for (const conflict of relevant) {
		process.stdout.write(
			`  ${styleCommand(`[${conflict.kind}]`)} ${styleCommand(conflict.id)} ${pc.yellow(conflict.state)}\n`,
		);
		process.stdout.write(`    ${styleHint(`reason: ${conflict.reason}`)}\n`);
		process.stdout.write(`    ${styleHint(`recommendation: ${conflict.recommendation}`)}\n`);
		if (conflict.diff?.summary) {
			process.stdout.write(`    ${styleHint(`diff: ${conflict.diff.summary}`)}\n`);
		}
		if (showFullDiff && conflict.diff?.preview?.length) {
			for (const line of conflict.diff.preview) {
				process.stdout.write(`    ${styleHint(line)}\n`);
			}
		}
	}
	process.stdout.write("\n");
}

function parseScanArgs(args: string[]): ScanOptions & { help?: boolean } {
	const options: ScanOptions = { sources: [], syncSelect: [] };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			return { ...options, help: true };
		}
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--sync") {
			options.sync = true;
			continue;
		}
		if (arg === "--diff") {
			options.diff = true;
			continue;
		}
		if (arg === "--diff-full") {
			options.diff = true;
			options.diffFull = true;
			continue;
		}
		if (arg === "--explain-conflicts") {
			options.explainConflicts = true;
			continue;
		}
		if (arg === "--sync-all") {
			options.syncAll = true;
			continue;
		}
		if (arg === "--sync-select") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --sync-select");
			}
			const entries = value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
			options.syncSelect.push(...entries);
			index += 1;
			continue;
		}
		if (arg === "--force" || arg === "-f") {
			options.force = true;
			continue;
		}
		if (arg === "--sources-full") {
			options.sourcesFull = true;
			continue;
		}
		if (arg === "--home") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --home");
			}
			options.home = value;
			index += 1;
			continue;
		}
		if (arg === "--source") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --source");
			}
			options.sources.push(value);
			index += 1;
			continue;
		}
		if (arg === "--source-only") {
			options.sourceOnly = true;
			continue;
		}
		throw new Error(`Unknown option for scan: ${arg}`);
	}
	if (options.sourceOnly && options.sources.length === 0) {
		throw new Error("Missing --source <path> when using --source-only.");
	}
	return options;
}

function printScanHelp(): void {
	const writeOption = (flag: string, description: string) => {
		process.stdout.write(`  ${styleCommand(flag.padEnd(36))} ${styleHint(description)}\n`);
	};

	process.stdout.write(`${styleLabel("Usage")}: ${styleCommand("dotagents scan [options]")}\n`);
	process.stdout.write(`${styleLabel("Options")}\n`);
	writeOption("--home <path>", "Use a specific home repository");
	writeOption("--source <path>", "Add explicit scan source (repeatable)");
	writeOption("--source-only", "Use only explicit --source values");
	writeOption("--json", "Emit machine-readable JSON output");
	writeOption("--sync", "Prompt to select unsynced assets to import");
	writeOption("--diff", "Include compact conflict diff summaries");
	writeOption("--diff-full", "Include expanded conflict diff previews");
	writeOption("--explain-conflicts", "Print conflict reasons and recommendations");
	writeOption("--sync-all", "Import all unsynced assets without prompting");
	writeOption("--sync-select <kind:id:path,...>", "Import specific unsynced assets by key");
	writeOption("--force, -f", "Overwrite on import when target exists");
	writeOption("--sources-full", "Print full configured source list");
	writeOption("--help, -h", "Show this help");
	process.stdout.write(`\n${styleLabel("Examples")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents scan")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents scan --sync")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents scan --diff")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents scan --source ./.tmp/srcA --source-only --diff")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents scan --sync-all --force")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents scan --sync-select prompt:release:/path/to/release.md")}\n`,
	);
	process.stdout.write(`\n${styleLabel("Notes")}\n`);
	process.stdout.write(
		`  ${styleHint("--sync opens interactive multi-select when unsynced assets are found.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--sync-all imports all unsynced assets without prompting.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--sync-select imports specific unsynced assets by key [kind:id:path].")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--diff and --diff-full help review conflicts before syncing/importing.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--sources-full prints all configured source paths instead of summary.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("Current project path is included as a scan source unless --source-only is set.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--source-only disables default sources and project auto-source for isolated scans.")}\n`,
	);
}

function formatSourcesSummary(
	allRoots: string[],
	activeRoots: string[],
	sourcesFull = false,
): string {
	if (sourcesFull) {
		return styleHint(allRoots.join(", "));
	}
	const sampleSize = 4;
	const sample = activeRoots.slice(0, sampleSize).map(shortenPath);
	const summary = `${activeRoots.length} active of ${allRoots.length} configured`;
	if (sample.length === 0) {
		return styleHint(summary);
	}
	const suffix = activeRoots.length > sample.length ? ", ..." : "";
	return styleHint(`${summary} (${sample.join(", ")}${suffix})`);
}

async function listExistingDirectories(roots: string[]): Promise<string[]> {
	const checks = await Promise.all(
		roots.map(async (root) => ({
			root,
			exists: await directoryExists(root),
		})),
	);
	return checks.filter((item) => item.exists).map((item) => item.root);
}

async function directoryExists(targetPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(targetPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

function shortenPath(targetPath: string): string {
	const homePath = homedir();
	if (!targetPath.startsWith(homePath)) {
		return targetPath;
	}
	return targetPath.replace(homePath, "~");
}

function withProjectSource(sources: ScanSource[]): ScanSource[] {
	const projectSource: ScanSource = {
		name: "project",
		root: process.cwd(),
		explicit: false,
	};
	return dedupeSourcesByRoot([...sources, projectSource]);
}

function dedupeSourcesByRoot(sources: ScanSource[]): ScanSource[] {
	const seen = new Set<string>();
	const deduped: ScanSource[] = [];
	for (const source of sources) {
		const resolvedRoot = path.resolve(source.root);
		if (seen.has(resolvedRoot)) {
			continue;
		}
		seen.add(resolvedRoot);
		deduped.push({ ...source, root: resolvedRoot });
	}
	return deduped;
}

function buildExplicitSources(values: string[]): ScanSource[] {
	return values.map((value) => ({
		name: "custom",
		root: expandTilde(value),
		explicit: true,
	}));
}
