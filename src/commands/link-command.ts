import { homedir } from "node:os";
import path from "node:path";
import * as p from "@clack/prompts";
import {
	ensureHomeRepoStructure,
	installPromptFromHome,
	installSkillFromHome,
	listHomePromptIds,
	listHomeSkillIds,
	slugifyName,
} from "../core/assets.js";
import { buildDefaultConfig, loadGlobalConfig } from "../core/config.js";
import { styleCommand, styleError, styleHint, styleLabel, styleSuccess } from "../ui/brand.js";

type LinkOptions = {
	force?: boolean;
	home?: string;
	to?: string;
	agents: string[];
	all?: boolean;
	select: string[];
	kind?: "prompt" | "skill";
	name?: string;
};

export async function runLinkCommand(args: string[]): Promise<number> {
	let parsed: ReturnType<typeof parseLinkArgs>;
	try {
		parsed = parseLinkArgs(args);
	} catch (error) {
		process.stderr.write(`${styleError(error instanceof Error ? error.message : String(error))}\n`);
		return 2;
	}
	if (parsed.help) {
		printLinkHelp();
		return 0;
	}
	if (parsed.options.to && parsed.options.agents.length > 0) {
		process.stderr.write(
			`${styleError("Cannot combine --to with --agent.")} ${styleHint("Use one targeting mode.")}\n`,
		);
		return 2;
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
	if (parsed.options.all && parsed.options.select.length > 0) {
		process.stderr.write(
			`${styleError("Cannot combine --all with --select.")} ${styleHint("Use one selection mode.")}\n`,
		);
		return 2;
	}

	const home = await ensureHomeRepoStructure(parsed.options.home);
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

	if (!parsed.name) {
		if (parsed.options.all || parsed.options.select.length > 0) {
			const selected = await selectAssetsFromFlags(home, kind, parsed.options);
			if (selected.length === 0) {
				process.stdout.write(`${styleHint("No assets selected.")}\n`);
				return 1;
			}
			for (const name of selected) {
				await linkSingleAsset(kind, home, name, parsed.options);
			}
			return 0;
		}
		if (!process.stdout.isTTY || !process.stdin.isTTY) {
			process.stderr.write(`${styleError("Missing asset name.")}\n`);
			printLinkHelp();
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
			await linkSingleAsset(kind, home, name, parsed.options);
		}
		return 0;
	}

	const normalizedName = slugifyName(parsed.name);
	if (!normalizedName) {
		process.stderr.write(`${styleError("Invalid name.")}\n`);
		return 2;
	}

	await linkSingleAsset(kind, home, normalizedName, parsed.options);
	return 0;
}

async function linkSingleAsset(
	kind: "prompt" | "skill",
	home: string,
	name: string,
	options: LinkOptions,
): Promise<void> {
	if (options.agents.length > 0) {
		const agentTargets = await resolveAgentTargets(kind, name, options.agents);
		for (const target of agentTargets) {
			if (kind === "prompt") {
				await installPromptFromHome({
					home,
					name,
					targetFile: target.path,
					mode: "symlink",
					force: options.force,
				});
				process.stdout.write(
					`${styleSuccess("Linked prompt to")} ${styleCommand(target.id)}: ${styleCommand(target.path)}\n`,
				);
				continue;
			}
			await installSkillFromHome({
				home,
				name,
				targetDir: target.path,
				mode: "symlink",
				force: options.force,
			});
			process.stdout.write(
				`${styleSuccess("Linked skill to")} ${styleCommand(target.id)}: ${styleCommand(target.path)}\n`,
			);
		}
		return;
	}

	if (kind === "prompt") {
		const targetFile = options.to
			? path.resolve(options.to)
			: path.join(process.cwd(), ".agents", "prompts", `${name}.md`);
		await installPromptFromHome({
			home,
			name,
			targetFile,
			mode: "symlink",
			force: options.force,
		});
		process.stdout.write(`${styleSuccess("Linked prompt:")} ${styleCommand(targetFile)}\n`);
		return;
	}

	const targetDir = options.to
		? path.resolve(options.to)
		: path.join(process.cwd(), ".agents", "skills", name);
	await installSkillFromHome({
		home,
		name,
		targetDir,
		mode: "symlink",
		force: options.force,
	});
	process.stdout.write(`${styleSuccess("Linked skill:")} ${styleCommand(targetDir)}\n`);
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
	const ids =
		kind === "prompt"
			? Array.from(await listHomePromptIds(home)).sort((a, b) => a.localeCompare(b))
			: Array.from(await listHomeSkillIds(home)).sort((a, b) => a.localeCompare(b));

	if (ids.length === 0) {
		process.stdout.write(`${styleHint(`No ${kind}s found in ${home}.`)}\n`);
		return [];
	}

	if (explicitTargetPath) {
		const selected = await p.select({
			message: `Select ${kind} to link`,
			options: ids.map((id) => ({ value: id, label: id })),
		});
		if (p.isCancel(selected)) {
			return null;
		}
		return [selected];
	}

	const selected = await p.multiselect({
		message: `Select ${kind}s to link`,
		options: ids.map((id) => ({ value: id, label: id })),
	});
	if (p.isCancel(selected)) {
		return null;
	}
	return selected;
}

async function resolveAgentTargets(
	kind: "prompt" | "skill",
	name: string,
	agentIds: string[],
): Promise<Array<{ id: string; path: string }>> {
	const stored = await loadGlobalConfig();
	const defaults = buildDefaultConfig(path.join(homedir(), "dotagents"));
	const roots = {
		codex: stored?.agents.codex ?? defaults.agents.codex,
		claude: stored?.agents.claude ?? defaults.agents.claude,
		agents: stored?.agents.agents ?? defaults.agents.agents,
	};
	const targets: Array<{ id: string; path: string }> = [];
	for (const agentId of agentIds) {
		const root = roots[agentId as keyof typeof roots];
		if (!root) {
			continue;
		}
		const targetPath =
			kind === "prompt"
				? path.join(root, "prompts", `${name}.md`)
				: path.join(root, "skills", name);
		targets.push({ id: agentId, path: path.resolve(targetPath) });
	}
	return targets;
}

async function selectAssetsFromFlags(
	home: string,
	kind: "prompt" | "skill",
	options: LinkOptions,
): Promise<string[]> {
	const ids =
		kind === "prompt"
			? Array.from(await listHomePromptIds(home)).sort((a, b) => a.localeCompare(b))
			: Array.from(await listHomeSkillIds(home)).sort((a, b) => a.localeCompare(b));
	if (options.all) {
		return ids;
	}
	const wanted = new Set(
		options.select
			.flatMap((item) => item.split(","))
			.map((item) => item.trim())
			.filter(Boolean)
			.map((item) => slugifyName(item)),
	);
	return ids.filter((id) => wanted.has(id));
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

function parseLinkArgs(args: string[]): {
	kind?: string;
	name?: string;
	options: LinkOptions;
	help?: boolean;
} {
	const positionals: string[] = [];
	const options: LinkOptions = { agents: [], select: [] };

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
		if (arg === "--to") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --to");
			}
			options.to = value;
			index += 1;
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
		if (arg === "--all") {
			options.all = true;
			continue;
		}
		if (arg === "--select") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --select");
			}
			options.select.push(value);
			index += 1;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new Error(`Unknown option for link: ${arg}`);
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

function printLinkHelp(): void {
	const writeOption = (flag: string, description: string) => {
		process.stdout.write(`  ${styleCommand(flag.padEnd(32))} ${styleHint(description)}\n`);
	};

	process.stdout.write(
		`${styleLabel("Usage")}: ${styleCommand("dotagents link [prompt|skill] [name] [options]")}\n`,
	);
	process.stdout.write(`${styleLabel("Options")}\n`);
	writeOption("--kind <prompt|skill>", "Set asset kind explicitly");
	writeOption("--name <slug>", "Set asset name explicitly");
	writeOption("--to <path>", "Override destination path");
	writeOption("--agent, -a <name>", "Target configured global homes: codex, claude, agents");
	writeOption("--all", "When name omitted, link all matching home assets");
	writeOption("--select <name,...>", "When name omitted, link selected comma-separated assets");
	writeOption("--home <path>", "Use a specific home repository");
	writeOption("--force, -f", "Overwrite existing destination");
	writeOption("--help, -h", "Show this help");
	process.stdout.write(`\n${styleLabel("Examples")}\n`);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents link prompt release")}\n`);
	process.stdout.write(
		`  ${styleHint("$")} ${styleCommand("dotagents link skill terminal-ui --agent codex")}\n`,
	);
	process.stdout.write(`  ${styleHint("$")} ${styleCommand("dotagents link prompt --all")}\n`);
	process.stdout.write(`\n${styleLabel("Notes")}\n`);
	process.stdout.write(
		`  ${styleHint("Link a prompt or skill from your home repo into the current project.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("If <name> is omitted in interactive mode, you'll choose from available home assets.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("Use --agent/-a to target configured global agent homes (repeatable or comma-separated).")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("Use --all or --select when <name> is omitted to avoid interactive asset pickers.")}\n`,
	);
}
