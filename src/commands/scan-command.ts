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
import { defaultScanSources, type ScanSource } from "../core/config.js";
import type { AssetKind, DiscoveredAsset } from "../core/types.js";
import { styleCommand, styleHint, styleLabel } from "../ui/brand.js";

type ScanOptions = {
	home?: string;
	json?: boolean;
	sources: string[];
	sync?: boolean;
	force?: boolean;
	sourcesFull?: boolean;
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

	const home = await ensureHomeRepoStructure(options.home);
	const configuredSources = await defaultScanSources(options.sources);
	const sources = withProjectSource(configuredSources);
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

	if (options.json) {
		process.stdout.write(`${JSON.stringify({ ...report, statuses: statusItems }, null, 2)}\n`);
		return report.unsyncedPrompts.length + report.unsyncedSkills.length > 0 ? 1 : 0;
	}

	process.stdout.write(`${pc.bold("dotagents scan")}\n`);
	process.stdout.write(`${styleLabel("home")}: ${pc.cyan(report.home)}\n`);
	process.stdout.write(
		`${styleLabel("sources")}: ${formatSourcesSummary(sourceRoots, activeSourceRoots, options.sourcesFull)}\n\n`,
	);

	printStatusSection(
		"Synced + git tracked",
		statusItems.filter((item) => item.state === "synced-tracked"),
		pc.green("●"),
	);
	printStatusSection(
		"Synced + untracked in home git",
		statusItems.filter((item) => item.state === "synced-untracked"),
		pc.yellow("●"),
	);
	printStatusSection(
		"Unsynced (missing from home)",
		statusItems.filter((item) => item.state === "unsynced-untracked"),
		pc.red("●"),
	);
	if (statusItems.length === 0) {
		process.stdout.write(`\n${styleHint("No assets discovered in configured scan sources.")}\n`);
		return 0;
	}

	const shouldPromptSync = options.sync || (Boolean(process.stdout.isTTY) && !options.json);
	if (shouldPromptSync) {
		return await promptAndSyncUnsynced(
			home,
			[...report.unsyncedPrompts, ...report.unsyncedSkills],
			options.force,
		);
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
): Promise<number> {
	if (assets.length === 0) {
		return 0;
	}

	const selected = await p.multiselect({
		message: "Select unsynced assets to import into home repo",
		options: assets.map((asset) => ({
			value: `${asset.kind}:${asset.id}:${asset.path}`,
			label: `[${asset.kind}] ${asset.id}  (${asset.source})`,
			hint: asset.path,
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
	const targets = assets.filter((asset) => chosen.has(`${asset.kind}:${asset.id}:${asset.path}`));
	let failures = 0;
	for (const asset of targets) {
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

function parseScanArgs(args: string[]): ScanOptions & { help?: boolean } {
	const options: ScanOptions = { sources: [] };
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
		throw new Error(`Unknown option for scan: ${arg}`);
	}
	return options;
}

function printScanHelp(): void {
	process.stdout.write(
		`Usage: ${styleCommand("dotagents scan [--home <path>] [--source <path> ...] [--json] [--sync] [--force] [--sources-full]")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--sync opens interactive multi-select when unsynced assets are found.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("--sources-full prints all configured source paths instead of summary.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("Current project path is always included as a scan source.")}\n`,
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
