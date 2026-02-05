import fs from "node:fs";
import path from "node:path";
import { runAddCommand } from "./commands/add-command.js";
import { runConfigCommand } from "./commands/config-command.js";
import { runNewCommand } from "./commands/new-command.js";
import { runScanCommand } from "./commands/scan-command.js";
import { runSkillCommand } from "./commands/skill-command.js";
import { ensureConfiguredForRun } from "./core/bootstrap.js";
import { printBanner, printHelp, styleError } from "./ui/brand.js";

export async function runCli(argv: string[]): Promise<number> {
	const [command, ...rest] = argv;
	printBanner();

	if (!command || command === "--help" || command === "-h" || command === "help") {
		printHelp(readVersion());
		return 0;
	}
	if (command === "--version" || command === "-v" || command === "version") {
		process.stdout.write(`${readVersion()}\n`);
		return 0;
	}

	try {
		if (command === "config") {
			return await runConfigCommand(rest);
		}
		// Initialize global config and home repo layout on first run.
		await ensureConfiguredForRun();

		if (command === "new") {
			return await runNewCommand(rest);
		}
		if (command === "add") {
			return await runAddCommand(rest);
		}
		if (command === "scan") {
			return await runScanCommand(rest);
		}
		if (command === "skill") {
			return await runSkillCommand(rest);
		}

		process.stderr.write(`${styleError(`Unknown command: ${command}`)}\n`);
		printHelp(readVersion());
		return 2;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${styleError(message)}\n`);
		return 1;
	}
}

function readVersion(): string {
	try {
		const packagePath = path.join(process.cwd(), "package.json");
		if (fs.existsSync(packagePath)) {
			const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: string };
			return parsed.version ?? "0.0.0";
		}
		const packageUrl = new URL("../package.json", import.meta.url);
		const parsed = JSON.parse(fs.readFileSync(packageUrl, "utf8")) as { version?: string };
		return parsed.version ?? "0.0.0";
	} catch {
		return "0.0.0";
	}
}
