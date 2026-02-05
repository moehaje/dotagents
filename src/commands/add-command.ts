import path from "node:path";
import pc from "picocolors";
import {
	copyPromptFromHome,
	copySkillFromHome,
	ensureHomeRepoStructure,
	slugifyName,
} from "../core/assets.js";

type AddOptions = {
	force?: boolean;
	home?: string;
	to?: string;
};

export async function runAddCommand(args: string[]): Promise<number> {
	const parsed = parseAddArgs(args);
	if (parsed.help) {
		printAddHelp();
		return 0;
	}

	const kind = parsed.kind ?? "prompt";
	if (kind !== "prompt" && kind !== "skill") {
		process.stderr.write(`Invalid asset kind: ${kind}. Use prompt or skill.\n`);
		return 2;
	}

	if (!parsed.name) {
		process.stderr.write("Missing asset name.\n");
		printAddHelp();
		return 2;
	}

	const home = await ensureHomeRepoStructure(parsed.options.home);
	const normalizedName = slugifyName(parsed.name);
	if (!normalizedName) {
		process.stderr.write("Invalid name.\n");
		return 2;
	}

	if (kind === "prompt") {
		const targetFile = parsed.options.to
			? path.resolve(parsed.options.to)
			: path.join(process.cwd(), ".agents", "prompts", `${normalizedName}.md`);
		await copyPromptFromHome({
			home,
			name: normalizedName,
			targetFile,
			force: parsed.options.force,
		});
		process.stdout.write(`${pc.green("Added prompt:")} ${targetFile}\n`);
		return 0;
	}

	const targetDir = parsed.options.to
		? path.resolve(parsed.options.to)
		: path.join(process.cwd(), ".agents", "skills", normalizedName);
	await copySkillFromHome({
		home,
		name: normalizedName,
		targetDir,
		force: parsed.options.force,
	});
	process.stdout.write(`${pc.green("Added skill:")} ${targetDir}\n`);
	return 0;
}

function parseAddArgs(args: string[]): {
	kind?: string;
	name?: string;
	options: AddOptions;
	help?: boolean;
} {
	const positionals: string[] = [];
	const options: AddOptions = {};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			return { options, help: true };
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
		if (arg === "--to") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --to");
			}
			options.to = value;
			index += 1;
			continue;
		}
		positionals.push(arg);
	}

	const first = positionals[0];
	if (first === "prompt" || first === "skill") {
		return {
			kind: first,
			name: positionals[1],
			options,
		};
	}
	return {
		kind: "prompt",
		name: first,
		options,
	};
}

function printAddHelp(): void {
	process.stdout.write("Usage: dotagents add [prompt|skill] <name> [--to <path>] [--home <path>] [--force]\n");
}
