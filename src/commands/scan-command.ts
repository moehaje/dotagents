import pc from "picocolors";
import { ensureHomeRepoStructure, scanUnsyncedAssets } from "../core/assets.js";
import { defaultScanSources } from "../core/config.js";

type ScanOptions = {
	home?: string;
	json?: boolean;
	sources: string[];
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
		sources: defaultScanSources(options.sources),
	});

	if (options.json) {
		process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
		return report.unsyncedPrompts.length + report.unsyncedSkills.length > 0 ? 1 : 0;
	}

	process.stdout.write(`${pc.bold("dotagents scan")}\n`);
	process.stdout.write(`home: ${pc.cyan(report.home)}\n`);
	process.stdout.write(`sources: ${pc.dim(report.scannedSources.join(", "))}\n\n`);

	if (report.unsyncedPrompts.length === 0 && report.unsyncedSkills.length === 0) {
		process.stdout.write(`${pc.green("No unsynced assets found.")}\n`);
		return 0;
	}

	if (report.unsyncedPrompts.length > 0) {
		process.stdout.write(`${pc.bold("Unsynced prompts")} (${report.unsyncedPrompts.length})\n`);
		for (const asset of report.unsyncedPrompts) {
			process.stdout.write(`  - ${asset.id} ${pc.dim(`(${asset.path})`)}\n`);
		}
		process.stdout.write("\n");
	}

	if (report.unsyncedSkills.length > 0) {
		process.stdout.write(`${pc.bold("Unsynced skills")} (${report.unsyncedSkills.length})\n`);
		for (const asset of report.unsyncedSkills) {
			process.stdout.write(`  - ${asset.id} ${pc.dim(`(${asset.path})`)}\n`);
		}
		process.stdout.write("\n");
	}

	return 1;
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
	process.stdout.write("Usage: dotagents scan [--home <path>] [--source <path> ...] [--json]\n");
}
