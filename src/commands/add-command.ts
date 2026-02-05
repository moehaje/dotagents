import path from "node:path";
import * as p from "@clack/prompts";
import {
	copyPromptFromHome,
	copySkillFromHome,
	ensureHomeRepoStructure,
	listHomePromptIds,
	listHomeSkillIds,
	slugifyName,
} from "../core/assets.js";
import { styleCommand, styleError, styleHint, styleSuccess } from "../ui/brand.js";

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

	const home = await ensureHomeRepoStructure(parsed.options.home);
	const kind = parsed.kind ?? (await resolveInteractiveKind());
	if (!kind) {
		p.cancel("Canceled.");
		return 130;
	}
	if (kind !== "prompt" && kind !== "skill") {
		process.stderr.write(`${styleError(`Invalid asset kind: ${kind}.`)} ${styleHint("Use prompt or skill.")}\n`);
		return 2;
	}

	if (!parsed.name) {
		if (!process.stdout.isTTY || !process.stdin.isTTY) {
			process.stderr.write(`${styleError("Missing asset name.")}\n`);
			printAddHelp();
			return 2;
		}
		const selected = await selectAssetsFromHome(home, kind, parsed.options.to);
		if (selected === null) {
			p.cancel("Canceled.");
			return 130;
		}
		if (selected.length === 0) {
			process.stdout.write(`${styleHint("No assets selected.")}\n`);
			return 1;
		}
		for (const name of selected) {
			await addSingleAsset(kind, home, name, parsed.options);
		}
		return 0;
	}

	const normalizedName = slugifyName(parsed.name);
	if (!normalizedName) {
		process.stderr.write(`${styleError("Invalid name.")}\n`);
		return 2;
	}

	await addSingleAsset(kind, home, normalizedName, parsed.options);
	return 0;
}

async function addSingleAsset(kind: "prompt" | "skill", home: string, name: string, options: AddOptions): Promise<void> {
	if (kind === "prompt") {
		const targetFile = options.to
			? path.resolve(options.to)
			: path.join(process.cwd(), ".agents", "prompts", `${name}.md`);
		await copyPromptFromHome({
			home,
			name,
			targetFile,
			force: options.force,
		});
		process.stdout.write(`${styleSuccess("Added prompt:")} ${styleCommand(targetFile)}\n`);
		return;
	}

	const targetDir = options.to
		? path.resolve(options.to)
		: path.join(process.cwd(), ".agents", "skills", name);
	await copySkillFromHome({
		home,
		name,
		targetDir,
		force: options.force,
	});
	process.stdout.write(`${styleSuccess("Added skill:")} ${styleCommand(targetDir)}\n`);
}

async function resolveInteractiveKind(): Promise<"prompt" | "skill" | null> {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return "prompt";
	}
	const selected = await p.select({
		message: "Asset kind",
		options: [
			{ value: "prompt", label: "Prompt" },
			{ value: "skill", label: "Skill" },
		],
	});
	if (p.isCancel(selected)) {
		return null;
	}
	return selected;
}

async function selectAssetsFromHome(
	home: string,
	kind: "prompt" | "skill",
	explicitTargetPath: string | undefined,
): Promise<string[] | null> {
	const ids = kind === "prompt"
		? Array.from(await listHomePromptIds(home)).sort((a, b) => a.localeCompare(b))
		: Array.from(await listHomeSkillIds(home)).sort((a, b) => a.localeCompare(b));

	if (ids.length === 0) {
		process.stdout.write(`${styleHint(`No ${kind}s found in ${home}.`)}\n`);
		return [];
	}

	if (explicitTargetPath) {
		const selected = await p.select({
			message: `Select ${kind} to add`,
			options: ids.map((id) => ({ value: id, label: id })),
		});
		if (p.isCancel(selected)) {
			return null;
		}
		return [selected];
	}

	const selected = await p.multiselect({
		message: `Select ${kind}s to add`,
		options: ids.map((id) => ({ value: id, label: id })),
	});
	if (p.isCancel(selected)) {
		return null;
	}
	return selected;
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
		kind: undefined,
		name: first,
		options,
	};
}

function printAddHelp(): void {
	process.stdout.write(`Usage: ${styleCommand("dotagents add [prompt|skill] <name> [--to <path>] [--home <path>] [--force]")}\n`);
	process.stdout.write(`  ${styleHint("Copy a prompt or skill from your home repo into the current project.")}\n`);
	process.stdout.write(`  ${styleHint("If <name> is omitted in interactive mode, you'll choose from available home assets.")}\n`);
}
