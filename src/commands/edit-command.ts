import fs from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";
import {
	ensureHomeRepoStructure,
	listHomePromptIds,
	listHomeSkillIds,
	listPromptIdsFromRoot,
	listSkillIdsFromRoot,
	slugifyName,
} from "../core/assets.js";
import { loadGlobalConfig } from "../core/config.js";
import { openInEditor, resolveEditorCommand, runInlineEdit } from "../core/editor.js";
import {
	hasExplicitTargetSelection,
	resolveCreateEditTargets,
	resolveTargetScopeRoots,
	validateSkillFileHelperPath,
} from "../core/target-resolution.js";
import {
	styleCommand,
	styleError,
	styleHint,
	styleLabel,
	styleSuccess,
	styleWarning,
} from "../ui/brand.js";

type EditCommandOptions = {
	kind?: "prompt" | "skill";
	name?: string;
	home?: string;
	project?: boolean;
	global?: boolean;
	agents: string[];
	file?: string;
	inline?: boolean;
	editor?: string;
};

export async function runEditCommand(args: string[]): Promise<number> {
	let parsed: ReturnType<typeof parseEditArgs>;
	try {
		parsed = parseEditArgs(args);
	} catch (error) {
		process.stderr.write(`${styleError(error instanceof Error ? error.message : String(error))}\n`);
		return 2;
	}
	if (parsed.help) {
		printEditHelp();
		return 0;
	}

	const normalizedAgents = normalizeAgents(parsed.options.agents);
	if (normalizedAgents.invalid.length > 0) {
		process.stderr.write(
			`${styleError(`Invalid agent target(s): ${normalizedAgents.invalid.join(", ")}`)} ${styleHint(
				"Use codex, claude, or agents.",
			)}\n`,
		);
		return 2;
	}
	parsed.options.agents = normalizedAgents.valid;

	const kind = parsed.kind ?? parsed.options.kind ?? (await resolveInteractiveKind());
	if (!kind) {
		p.cancel("Canceled.");
		return 130;
	}
	if (kind !== "prompt" && kind !== "skill") {
		process.stderr.write(
			`${styleError(`Invalid asset kind: ${kind}.`)} ${styleHint("Use prompt or skill.")}\n`,
		);
		return 2;
	}
	if (kind === "prompt" && parsed.options.file) {
		process.stderr.write(`${styleError("The --file option is only valid for skill edits.")}\n`);
		return 2;
	}

	const home = await ensureHomeRepoStructure(parsed.options.home);
	const name =
		parsed.name ??
		parsed.options.name ??
		(await resolveInteractiveName(kind, home, parsed.options));
	if (!name) {
		if (process.stdout.isTTY && process.stdin.isTTY) {
			p.cancel("Canceled.");
			return 130;
		}
		process.stderr.write(
			`${styleError("Missing asset name.")} ${styleHint(
				"Pass a name or run in interactive mode.",
			)}\n`,
		);
		return 2;
	}
	const assetId = slugifyName(name);
	if (!assetId) {
		process.stderr.write(`${styleError("Invalid asset name.")}\n`);
		return 2;
	}

	const targets = await resolveCreateEditTargets({
		kind,
		assetId,
		home,
		options: {
			project: parsed.options.project,
			global: parsed.options.global,
			agents: parsed.options.agents,
		},
	});
	if (targets.length === 0) {
		process.stderr.write(
			`${styleError("No edit targets resolved.")} ${styleHint("Adjust scope flags and try again.")}\n`,
		);
		return 2;
	}

	const target = await chooseTarget(targets);
	if (!target) {
		if (targets.length > 1 && !process.stdout.isTTY) {
			process.stderr.write(
				`${styleError(
					`Multiple edit targets resolved (${targets.length}).`,
				)} ${styleHint("Re-run interactively to choose one target, or narrow with -p/-g/-a.")}\n`,
			);
			return 2;
		}
		return 130;
	}

	const filePath = resolveEditFilePath(kind, target.path, parsed.options.file);
	if (!filePath.ok) {
		process.stderr.write(`${styleError(filePath.message)}\n`);
		return 2;
	}
	if (!(await existsPath(filePath.value))) {
		process.stderr.write(
			`${styleError(`Target does not exist: ${filePath.value}`)} ${styleHint(
				"Create or add the asset first, then edit it.",
			)}\n`,
		);
		return 1;
	}

	process.stdout.write(
		`${styleLabel("Editing")} ${styleCommand(`[${kind}] ${assetId}`)} ${styleHint("->")} ${styleCommand(filePath.value)}\n`,
	);

	if (parsed.options.inline) {
		return await runInlineMode(filePath.value);
	}

	const config = await loadGlobalConfig();
	const editor = await resolveEditorCommand({
		explicitEditor: parsed.options.editor,
		configEditor: config?.editor,
	});

	if (!editor) {
		return await fallbackToInline(filePath.value);
	}

	const exitCode = await openInEditor(editor, filePath.value);
	if (exitCode === 0) {
		process.stdout.write(`${styleSuccess("Opened with editor:")} ${styleCommand(editor)}\n`);
		return 0;
	}

	process.stdout.write(
		`${styleWarning(`Editor exited with code ${exitCode}.`)} ${styleHint(
			"You can retry with --editor or use --inline.",
		)}\n`,
	);
	return await fallbackToInline(filePath.value);
}

async function runInlineMode(filePath: string): Promise<number> {
	try {
		const result = await runInlineEdit(filePath);
		if (result === "saved") {
			process.stdout.write(`${styleSuccess("Saved.")}\n`);
			return 0;
		}
		if (result === "unchanged") {
			process.stdout.write(`${styleHint("No changes detected.")}\n`);
			return 0;
		}
		return 130;
	} catch (error) {
		process.stderr.write(`${styleError(error instanceof Error ? error.message : String(error))}\n`);
		return 1;
	}
}

async function fallbackToInline(filePath: string): Promise<number> {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		process.stderr.write(
			`${styleError("No editor could be launched in non-interactive mode.")} ${styleHint(
				"Pass --editor <cmd> or run interactively with --inline.",
			)}\n`,
		);
		return 1;
	}

	const confirmInline = await p.confirm({
		message: "Editor unavailable. Continue with inline mode?",
		initialValue: true,
	});
	if (p.isCancel(confirmInline)) {
		return 130;
	}
	if (!confirmInline) {
		return 1;
	}
	return await runInlineMode(filePath);
}

async function chooseTarget(
	targets: Array<{ id: string; label: string; path: string }>,
): Promise<{ id: string; label: string; path: string } | null> {
	if (targets.length === 1) {
		return targets[0];
	}
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return null;
	}

	const selected = await p.select({
		message: "Select edit target",
		options: targets.map((target) => ({
			value: target.id,
			label: target.label,
			hint: target.path,
		})),
	});
	if (p.isCancel(selected)) {
		return null;
	}
	return targets.find((target) => target.id === selected) ?? null;
}

function resolveEditFilePath(
	kind: "prompt" | "skill",
	defaultPath: string,
	skillFile: string | undefined,
): { ok: true; value: string } | { ok: false; message: string } {
	if (kind === "prompt") {
		return { ok: true, value: defaultPath };
	}
	if (!skillFile) {
		return { ok: true, value: defaultPath };
	}

	const validation = validateSkillFileHelperPath(skillFile);
	if (!validation.valid) {
		return { ok: false, message: validation.reason };
	}
	return {
		ok: true,
		value: path.resolve(path.dirname(defaultPath), validation.normalizedPath),
	};
}

async function resolveInteractiveName(
	kind: "prompt" | "skill",
	home: string,
	options: EditCommandOptions,
): Promise<string | null> {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return null;
	}

	const scopeOptions = {
		project: options.project,
		global: options.global,
		agents: options.agents,
	};
	const hasExplicitScope = hasExplicitTargetSelection(scopeOptions);
	if (!hasExplicitScope) {
		const ids =
			kind === "prompt"
				? Array.from(await listHomePromptIds(home)).sort((left, right) => left.localeCompare(right))
				: Array.from(await listHomeSkillIds(home)).sort((left, right) => left.localeCompare(right));
		if (ids.length === 0) {
			process.stdout.write(`${styleHint(`No ${kind}s found in ${home}.`)}\n`);
			return null;
		}
		const selected = await p.select({
			message: `Select ${kind} to edit`,
			options: ids.map((id) => ({ value: id, label: id })),
		});
		if (p.isCancel(selected)) {
			return null;
		}
		return selected;
	}

	const scopeRoots = await resolveTargetScopeRoots({
		home,
		options: scopeOptions,
	});
	const scopedEntries = (
		await Promise.all(
			scopeRoots.map(async (scopeRoot) => {
				const ids =
					kind === "prompt"
						? Array.from(await listPromptIdsFromRoot(scopeRoot.root))
						: Array.from(await listSkillIdsFromRoot(scopeRoot.root));
				return ids.map((id) => ({
					id,
					scopeLabel: scopeRoot.label,
					scopeRoot: scopeRoot.root,
				}));
			}),
		)
	).flat();
	const dedupedById = new Map<string, { id: string; scopes: string[] }>();
	for (const entry of scopedEntries) {
		const existing = dedupedById.get(entry.id);
		if (existing) {
			existing.scopes.push(entry.scopeLabel);
			continue;
		}
		dedupedById.set(entry.id, {
			id: entry.id,
			scopes: [entry.scopeLabel],
		});
	}
	const choices = [...dedupedById.values()].sort((left, right) => left.id.localeCompare(right.id));
	if (choices.length === 0) {
		process.stdout.write(`${styleHint(`No ${kind}s found in selected scope.`)}\n`);
		return null;
	}
	const selected = await p.select({
		message: `Select ${kind} to edit`,
		options: choices.map((choice) => ({
			value: choice.id,
			label: choice.id,
			hint: choice.scopes.join(", "),
		})),
	});
	if (p.isCancel(selected)) {
		return null;
	}
	return selected;
}

async function resolveInteractiveKind(): Promise<"prompt" | "skill" | null> {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return null;
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

function normalizeAgents(agentInputs: string[]): { valid: string[]; invalid: string[] } {
	const validSet = new Set<string>();
	const invalidSet = new Set<string>();
	for (const item of agentInputs) {
		for (const part of item.split(",")) {
			const value = part.trim().toLowerCase();
			if (!value) {
				continue;
			}
			if (value === "codex" || value === "claude" || value === "agents") {
				validSet.add(value);
				continue;
			}
			invalidSet.add(value);
		}
	}
	return {
		valid: [...validSet],
		invalid: [...invalidSet],
	};
}

function parseEditArgs(args: string[]): {
	kind?: string;
	name?: string;
	help?: boolean;
	options: EditCommandOptions;
} {
	const positionals: string[] = [];
	const options: EditCommandOptions = { agents: [] };
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		if (arg === "--help" || arg === "-h") {
			return { options, help: true };
		}
		if (arg === "--kind") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --kind");
			}
			const normalized = value.trim().toLowerCase();
			if (normalized !== "prompt" && normalized !== "skill") {
				throw new Error("Invalid value for --kind. Use prompt or skill.");
			}
			options.kind = normalized;
			index += 1;
			continue;
		}
		if (arg === "--name") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --name");
			}
			options.name = value;
			index += 1;
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
		if (arg === "--project" || arg === "-p") {
			options.project = true;
			continue;
		}
		if (arg === "--global" || arg === "-g") {
			options.global = true;
			continue;
		}
		if (arg === "--agent" || arg === "-a") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --agent");
			}
			options.agents.push(value);
			index += 1;
			continue;
		}
		if (arg === "--file") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --file");
			}
			options.file = value;
			index += 1;
			continue;
		}
		if (arg === "--inline") {
			options.inline = true;
			continue;
		}
		if (arg === "--editor") {
			const value = args[index + 1];
			if (value === undefined) {
				throw new Error("Missing value for --editor");
			}
			options.editor = value;
			index += 1;
			continue;
		}
		positionals.push(arg);
	}

	const first = positionals[0];
	if (first === "prompt" || first === "skill") {
		return {
			kind: options.kind ?? first,
			name: options.name ?? positionals[1],
			options,
		};
	}
	return {
		kind: options.kind,
		name: options.name ?? first,
		options,
	};
}

function printEditHelp(): void {
	const writeOption = (flag: string, description: string) => {
		process.stdout.write(`  ${styleCommand(flag.padEnd(32))} ${styleHint(description)}\n`);
	};

	process.stdout.write(
		`${styleLabel("Usage")}: ${styleCommand("dotagents edit [prompt|skill] [name] [options]")}\n`,
	);
	process.stdout.write(`${styleLabel("Options")}\n`);
	writeOption("--kind <prompt|skill>", "Set asset kind explicitly");
	writeOption("--name <slug>", "Set asset name explicitly");
	writeOption("--file <relative/path>", "Skill-only file path; defaults to SKILL.md");
	writeOption("--editor <cmd>", "Override editor command for this invocation");
	writeOption("--inline", "Use in-terminal full-content replacement mode");
	writeOption("--home <path>", "Use a specific home repository");
	writeOption("--project, -p", "Target project-local asset paths");
	writeOption("--global, -g", "Target configured global agent paths");
	writeOption("--agent, -a <name>", "Filter by agent: codex, claude, agents");
	writeOption("--help, -h", "Show this help");
	process.stdout.write(`\n${styleLabel("Examples")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents edit prompt release")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents edit skill terminal-ui --file references/render-single-write.md")}\n`,
	);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents edit -p")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents edit prompt release -g -a codex")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents edit skill terminal-ui --inline")}\n`,
	);
	process.stdout.write(`\n${styleLabel("Notes")}\n`);
	process.stdout.write(
		`  ${styleHint("Defaults to home scope when no target flags are provided.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("If name is omitted in interactive mode, choose from assets discovered in the selected scope.")}\n`,
	);
}

async function existsPath(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
