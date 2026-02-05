import { spawn } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { ensureHomeRepoStructure } from "../core/assets.js";
import {
	applyRegistryUpdates,
	checkRegistryStatus,
	readSkillRegistry,
	type SkillRegistryEntry,
} from "../core/skill-registry.js";
import { styleCommand, styleHint, styleLabel } from "../ui/brand.js";

export async function runSkillCommand(args: string[]): Promise<number> {
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printSkillHelp();
		return 0;
	}

	const [subcommand, ...rest] = args;
	if (subcommand === "sync") {
		return await runRegistrySync(rest);
	}

	const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
	const child = spawn(npxCmd, ["skills", ...args], {
		stdio: "inherit",
		shell: false,
	});

	return await new Promise<number>((resolve) => {
		child.on("close", (code) => {
			resolve(code ?? 1);
		});
		child.on("error", () => {
			resolve(1);
		});
	});
}

async function runRegistrySync(args: string[]): Promise<number> {
	const options = parseSyncOptions(args);
	const home = await ensureHomeRepoStructure(options.home);
	const entries = await readSkillRegistry(home);
	if (entries.length === 0) {
		process.stdout.write(
			`${pc.yellow("No skill registry entries found at")} ${styleCommand(`${home}/configs/skills-registry.tsv`)}\n`,
		);
		return 0;
	}

	const statuses = await checkRegistryStatus(home);
	const outdated = statuses.filter((item) => item.status === "outdated" || item.status === "missing-local");
	const errored = statuses.filter((item) => item.status === "error");

	process.stdout.write(`${styleLabel("Skill registry status")}\n`);
	for (const status of statuses) {
		const label =
			status.status === "up-to-date"
				? pc.green(status.status)
				: status.status === "outdated"
					? pc.yellow(status.status)
					: status.status === "missing-local"
						? pc.yellow(status.status)
						: pc.red(status.status);
		process.stdout.write(`- ${status.entry.skillPath}: ${label}\n`);
		if (status.message) {
			process.stdout.write(`  ${pc.dim(status.message)}\n`);
		}
	}

	if (options.checkOnly) {
		return outdated.length > 0 || errored.length > 0 ? 1 : 0;
	}

	if (outdated.length === 0) {
		process.stdout.write(`${pc.green("All registry skills are up-to-date.")}\n`);
		return errored.length > 0 ? 1 : 0;
	}

	let targets: SkillRegistryEntry[] = outdated.map((item) => item.entry);
	if (!options.yes && process.stdout.isTTY) {
		const selected = await p.multiselect({
			message: "Select skills to update from registry",
			options: outdated.map((item) => ({
				value: item.entry.skillPath,
				label: `${item.entry.skillPath}  (${item.entry.sourceSpec})`,
			})),
			initialValues: outdated.map((item) => item.entry.skillPath),
		});
		if (p.isCancel(selected)) {
			p.cancel("Canceled.");
			return 130;
		}
		const selectedSet = new Set(selected);
		targets = targets.filter((entry) => selectedSet.has(entry.skillPath));
	}

	if (targets.length === 0) {
		process.stdout.write(`${styleHint("No skills selected for update.")}\n`);
		return 0;
	}

	const results = await applyRegistryUpdates(home, targets);
	const failed = results.filter((item) => !item.updated);
	for (const result of results) {
		if (result.updated) {
			process.stdout.write(`${pc.green("Updated")} ${result.entry.skillPath}\n`);
		} else {
			process.stdout.write(`${pc.red("Failed")} ${result.entry.skillPath}: ${result.message ?? "unknown"}\n`);
		}
	}

	return failed.length > 0 ? 1 : 0;
}

function parseSyncOptions(args: string[]): {
	checkOnly: boolean;
	yes: boolean;
	home?: string;
} {
	let checkOnly = false;
	let yes = false;
	let home: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) continue;
		if (arg === "--check") {
			checkOnly = true;
			continue;
		}
		if (arg === "--yes" || arg === "-y") {
			yes = true;
			continue;
		}
		if (arg === "--home") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --home");
			}
			home = value;
			index += 1;
			continue;
		}
		throw new Error(`Unknown option for skill sync: ${arg}`);
	}
	return { checkOnly, yes, home };
}

function printSkillHelp(): void {
	process.stdout.write(`${styleLabel("Usage")}\n`);
	process.stdout.write(`  ${styleCommand("dotagents skill <skills-cli-args...>")}\n`);
	process.stdout.write(`  ${styleCommand("dotagents skill sync [--check] [--yes] [--home <path>]")}\n`);
	process.stdout.write(`\n${styleLabel("Examples")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents skill add vercel-labs/skills@find-skills")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents skill sync --check")}\n`);
}
