import path from "node:path";
import {
	ensureHomeRepoStructure,
	installPromptFromHome,
	installSkillFromHome,
	slugifyName,
} from "../core/assets.js";
import { createProjectScaffold } from "../core/init.js";
import { styleCommand, styleError, styleHint, styleLabel, styleSuccess } from "../ui/brand.js";

type InitOptions = {
	force?: boolean;
	home?: string;
	link?: boolean;
	withAssets: string[];
};

type InitAssetSelection = {
	kind: "prompt" | "skill";
	name: string;
};

export async function runInitCommand(args: string[]): Promise<number> {
	let parsed: ReturnType<typeof parseInitArgs>;
	try {
		parsed = parseInitArgs(args);
	} catch (error) {
		process.stderr.write(`${styleError(error instanceof Error ? error.message : String(error))}\n`);
		return 2;
	}
	if (parsed.help) {
		printInitHelp();
		return 0;
	}

	const scaffoldEntries = await createProjectScaffold({
		projectRoot: process.cwd(),
		force: Boolean(parsed.options.force),
	});

	process.stdout.write(`${styleLabel("dotagents init")}\n`);
	for (const entry of scaffoldEntries) {
		if (entry.action === "created") {
			process.stdout.write(
				`${styleSuccess("Created")} ${styleCommand(path.relative(process.cwd(), entry.path) || entry.path)}\n`,
			);
			continue;
		}
		if (entry.action === "updated") {
			process.stdout.write(
				`${styleSuccess("Updated")} ${styleCommand(path.relative(process.cwd(), entry.path) || entry.path)}\n`,
			);
			continue;
		}
		process.stdout.write(
			`${styleHint("Skipped")} ${styleCommand(path.relative(process.cwd(), entry.path) || entry.path)}\n`,
		);
	}

	let selections: InitAssetSelection[];
	try {
		selections = parseWithAssets(parsed.options.withAssets);
	} catch (error) {
		process.stderr.write(`${styleError(error instanceof Error ? error.message : String(error))}\n`);
		return 2;
	}
	if (selections.length === 0) {
		return 0;
	}

	const home = await ensureHomeRepoStructure(parsed.options.home);
	let failures = 0;
	for (const selection of selections) {
		try {
			await applyInitAsset({
				home,
				selection,
				force: Boolean(parsed.options.force),
				link: Boolean(parsed.options.link),
			});
		} catch (error) {
			failures += 1;
			process.stderr.write(
				`${styleError(`Failed ${selection.kind}:${selection.name}`)}: ${
					error instanceof Error ? error.message : String(error)
				}\n`,
			);
		}
	}

	return failures > 0 ? 1 : 0;
}

async function applyInitAsset(input: {
	home: string;
	selection: InitAssetSelection;
	force: boolean;
	link: boolean;
}): Promise<void> {
	if (input.selection.kind === "prompt") {
		const targetFile = path.resolve(
			process.cwd(),
			".agents",
			"prompts",
			`${input.selection.name}.md`,
		);
		await installPromptFromHome({
			home: input.home,
			name: input.selection.name,
			targetFile,
			mode: input.link ? "symlink" : "copy",
			force: input.force,
		});
		process.stdout.write(
			`${styleSuccess(input.link ? "Linked prompt:" : "Added prompt:")} ${styleCommand(
				input.selection.name,
			)} ${styleHint("->")} ${styleCommand(targetFile)}\n`,
		);
		return;
	}

	const targetDir = path.resolve(process.cwd(), ".agents", "skills", input.selection.name);
	await installSkillFromHome({
		home: input.home,
		name: input.selection.name,
		targetDir,
		mode: input.link ? "symlink" : "copy",
		force: input.force,
	});
	process.stdout.write(
		`${styleSuccess(input.link ? "Linked skill:" : "Added skill:")} ${styleCommand(
			input.selection.name,
		)} ${styleHint("->")} ${styleCommand(targetDir)}\n`,
	);
}

function parseWithAssets(values: string[]): InitAssetSelection[] {
	const selections: InitAssetSelection[] = [];
	for (const value of values) {
		for (const item of value.split(",")) {
			const trimmed = item.trim();
			if (!trimmed) {
				continue;
			}
			const [kindRaw, nameRaw] = trimmed.split(":", 2);
			if (!kindRaw || !nameRaw) {
				throw new Error(`Invalid --with entry "${trimmed}". Use prompt:<name> or skill:<name>.`);
			}
			const kind = kindRaw.trim().toLowerCase();
			if (kind !== "prompt" && kind !== "skill") {
				throw new Error(`Invalid --with kind "${kindRaw}" in "${trimmed}". Use prompt or skill.`);
			}
			const name = slugifyName(nameRaw);
			if (!name) {
				throw new Error(`Invalid --with asset name in "${trimmed}".`);
			}
			selections.push({
				kind,
				name,
			});
		}
	}
	return dedupeSelections(selections);
}

function dedupeSelections(values: InitAssetSelection[]): InitAssetSelection[] {
	const output: InitAssetSelection[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		const key = `${value.kind}:${value.name}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		output.push(value);
	}
	return output;
}

function parseInitArgs(args: string[]): { options: InitOptions; help?: boolean } {
	const options: InitOptions = {
		withAssets: [],
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			return { options, help: true };
		}
		if (arg === "--project" || arg === "-p") {
			continue;
		}
		if (arg === "--force" || arg === "-f") {
			options.force = true;
			continue;
		}
		if (arg === "--link") {
			options.link = true;
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
		if (arg === "--with") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --with");
			}
			options.withAssets.push(value);
			index += 1;
			continue;
		}
		throw new Error(`Unknown option for init: ${arg}`);
	}

	return { options };
}

function printInitHelp(): void {
	const writeOption = (flag: string, description: string) => {
		process.stdout.write(`  ${styleCommand(flag.padEnd(32))} ${styleHint(description)}\n`);
	};

	process.stdout.write(`${styleLabel("Usage")}: ${styleCommand("dotagents init [options]")}\n`);
	process.stdout.write(`${styleLabel("Options")}\n`);
	writeOption("--project, -p", "Scaffold project-local .agents layout (default)");
	writeOption(
		"--with <asset,...>",
		"Optional assets to install, e.g. prompt:release,skill:terminal-ui",
	);
	writeOption("--link", "With --with, create symlinks instead of copies");
	writeOption("--home <path>", "Use a specific home repository");
	writeOption("--force, -f", "Overwrite scaffold files and existing targets");
	writeOption("--help, -h", "Show this help");
	process.stdout.write(`\n${styleLabel("Examples")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents init -p")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents init -p --with prompt:release,skill:terminal-ui")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents init -p --with prompt:release --link")}\n`,
	);
}
