import * as p from "@clack/prompts";
import pc from "picocolors";
import {
	ensureHomeRepoStructure,
	importDiscoveredAssetToHome,
	scanUnsyncedAssets,
} from "../core/assets.js";
import { defaultScanSources } from "../core/config.js";
import type { DiscoveredAsset } from "../core/types.js";
import { styleCommand, styleHint, styleLabel } from "../ui/brand.js";

type ScanOptions = {
	home?: string;
	json?: boolean;
	sources: string[];
	sync?: boolean;
	force?: boolean;
};

export async function runScanCommand(args: string[]): Promise<number> {
	const options = parseScanArgs(args);
	if (options.help) {
		printScanHelp();
		return 0;
	}

	const home = await ensureHomeRepoStructure(options.home);
	const report = await scanUnsyncedAssets({
		home,
		sources: await defaultScanSources(options.sources),
	});

	if (options.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return report.unsyncedPrompts.length + report.unsyncedSkills.length > 0 ? 1 : 0;
	}

	process.stdout.write(`${pc.bold("dotagents scan")}\n`);
	process.stdout.write(`${styleLabel("home")}: ${pc.cyan(report.home)}\n`);
	process.stdout.write(`${styleLabel("sources")}: ${styleHint(report.scannedSources.join(", "))}\n\n`);

	if (report.unsyncedPrompts.length === 0 && report.unsyncedSkills.length === 0) {
		process.stdout.write(`${pc.green("No unsynced assets found.")}\n`);
		return 0;
	}

	if (report.unsyncedPrompts.length > 0) {
		process.stdout.write(`${pc.bold("Unsynced prompts")} (${report.unsyncedPrompts.length})\n`);
		for (const asset of report.unsyncedPrompts) {
			process.stdout.write(`  - ${styleCommand(asset.id)} ${pc.dim(`[${asset.source}]`)} ${pc.dim(`(${asset.path})`)}\n`);
		}
		process.stdout.write("\n");
	}

	if (report.unsyncedSkills.length > 0) {
		process.stdout.write(`${pc.bold("Unsynced skills")} (${report.unsyncedSkills.length})\n`);
		for (const asset of report.unsyncedSkills) {
			process.stdout.write(`  - ${styleCommand(asset.id)} ${pc.dim(`[${asset.source}]`)} ${pc.dim(`(${asset.path})`)}\n`);
		}
		process.stdout.write("\n");
	}

	const shouldPromptSync = options.sync || (Boolean(process.stdout.isTTY) && !options.json);
	if (shouldPromptSync) {
		return await promptAndSyncUnsynced(home, [...report.unsyncedPrompts, ...report.unsyncedSkills], options.force);
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
			process.stdout.write(`${pc.green("Synced")} [${asset.kind}] ${asset.id} -> ${targetPath}\n`);
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
		`Usage: ${styleCommand("dotagents scan [--home <path>] [--source <path> ...] [--json] [--sync] [--force]")}\n`,
	);
	process.stdout.write(`  ${styleHint("--sync opens interactive multi-select when unsynced assets are found.")}\n`);
}
