import fs from "node:fs/promises";
import path from "node:path";
import pc from "picocolors";
import { type AssetCheckResult, type CheckSummary, runAssetChecks } from "../core/check.js";
import { resolveHomeRepository } from "../core/config.js";
import { styleCommand, styleError, styleHint, styleLabel } from "../ui/brand.js";

type CheckOptions = {
	home?: string;
	json?: boolean;
	strict?: boolean;
	kind?: "prompt" | "skill";
	filter: string[];
	exclude: string[];
};

export async function runCheckCommand(args: string[]): Promise<number> {
	let parsed: ReturnType<typeof parseCheckArgs>;
	try {
		parsed = parseCheckArgs(args);
	} catch (error) {
		process.stderr.write(`${styleError(error instanceof Error ? error.message : String(error))}\n`);
		return 2;
	}

	if (parsed.help) {
		printCheckHelp();
		return 0;
	}

	const home = path.resolve(await resolveHomeRepository(parsed.options.home));
	if (!(await isDirectory(home))) {
		process.stderr.write(
			`${styleError(`Home path does not exist: ${home}`)} ${styleHint(
				"Use --home <path> or configure it with `dotagents config --home <path>`.",
			)}\n`,
		);
		return 1;
	}

	const summary = await runAssetChecks({
		home,
		kindFilter: parsed.options.kind,
		filterNames: parsed.options.filter,
		excludeNames: parsed.options.exclude,
	});
	const shouldFail =
		summary.errorCount > 0 || (Boolean(parsed.options.strict) && summary.warningCount > 0);

	if (parsed.options.json) {
		process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
		return shouldFail ? 1 : 0;
	}

	printHumanSummary(summary, parsed.options.kind);
	if (summary.errorCount === 0 && summary.warningCount === 0) {
		process.stdout.write(`\n${pc.green("No issues found.")}\n`);
	} else if (shouldFail) {
		process.stdout.write(`\n${pc.red("Validation failed.")}\n`);
	} else {
		process.stdout.write(`\n${pc.yellow("Validation completed with warnings.")}\n`);
	}
	return shouldFail ? 1 : 0;
}

function parseCheckArgs(args: string[]): { options: CheckOptions; help?: boolean } {
	const options: CheckOptions = {
		filter: [],
		exclude: [],
	};
	const positionals: string[] = [];

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			return { options, help: true };
		}
		if (arg === "--json") {
			options.json = true;
			continue;
		}
		if (arg === "--strict") {
			options.strict = true;
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
		if (arg === "--filter") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --filter");
			}
			options.filter.push(value);
			index += 1;
			continue;
		}
		if (arg === "--exclude") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --exclude");
			}
			options.exclude.push(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown option for check: ${arg}`);
		}
		positionals.push(arg);
	}

	if (positionals.length > 1) {
		throw new Error("Too many positional arguments for check. Use `prompt` or `skill`.");
	}
	if (positionals[0]) {
		const kind = positionals[0].trim().toLowerCase();
		if (kind !== "prompt" && kind !== "skill") {
			throw new Error(`Invalid check target: ${positionals[0]}. Use prompt or skill.`);
		}
		options.kind = kind;
	}

	return { options };
}

function printHumanSummary(summary: CheckSummary, kindFilter?: "prompt" | "skill"): void {
	process.stdout.write(`${pc.bold("dotagents check")}\n`);
	process.stdout.write(`${styleLabel("home")}: ${styleCommand(summary.home)}\n\n`);

	if (!kindFilter || kindFilter === "prompt") {
		process.stdout.write(
			`${styleLabel("Prompt checks")}: ${summary.prompts.checked} checked, ${summary.prompts.errors} errors, ${summary.prompts.warnings} warnings\n`,
		);
	}
	if (!kindFilter || kindFilter === "skill") {
		process.stdout.write(
			`${styleLabel("Skill checks")}: ${summary.skills.checked} checked, ${summary.skills.errors} errors, ${summary.skills.warnings} warnings\n`,
		);
	}

	const failingResults = collectResultsWithIssues(summary, kindFilter);
	if (failingResults.length === 0) {
		return;
	}

	process.stdout.write("\n");
	for (const result of failingResults) {
		for (const issue of result.issues) {
			const icon = issue.severity === "error" ? pc.red("✗") : pc.yellow("⚠");
			process.stdout.write(
				`${icon} ${styleCommand(`[${result.kind}]`)} ${styleCommand(result.id)}: ${issue.message}\n`,
			);
			process.stdout.write(`  ${styleHint(issue.path)}\n`);
			if (issue.hint) {
				process.stdout.write(`  ${styleHint(issue.hint)}\n`);
			}
		}
	}
}

function collectResultsWithIssues(
	summary: CheckSummary,
	kindFilter?: "prompt" | "skill",
): AssetCheckResult[] {
	if (kindFilter === "prompt") {
		return summary.prompts.results.filter((result) => result.issues.length > 0);
	}
	if (kindFilter === "skill") {
		return summary.skills.results.filter((result) => result.issues.length > 0);
	}
	return [...summary.prompts.results, ...summary.skills.results].filter(
		(result) => result.issues.length > 0,
	);
}

function printCheckHelp(): void {
	const writeOption = (flag: string, description: string) => {
		process.stdout.write(`  ${styleCommand(flag.padEnd(28))} ${styleHint(description)}\n`);
	};

	process.stdout.write(
		`${styleLabel("Usage")}: ${styleCommand("dotagents check [prompt|skill] [options]")}\n`,
	);
	process.stdout.write(`${styleLabel("Options")}\n`);
	writeOption("--home <path>", "Use a specific home repository");
	writeOption("--json", "Emit machine-readable JSON report");
	writeOption("--strict", "Treat warnings as failures");
	writeOption("--filter <name,...>", "Check only assets matching exact id or basename");
	writeOption("--exclude <name,...>", "Skip assets matching exact id or basename");
	writeOption("--help, -h", "Show this help");
	process.stdout.write(`\n${styleLabel("Examples")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents check")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents check --filter axiom")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents check --exclude legacy --strict")}\n`,
	);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents check prompt --strict")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents check skill --home ~/dotagents --json")}\n`,
	);
}

async function isDirectory(targetPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(targetPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}
