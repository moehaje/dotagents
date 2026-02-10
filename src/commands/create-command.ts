import fs from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
	copyPromptFromHome,
	copySkillFromHome,
	ensureHomeRepoStructure,
	slugifyName,
} from "../core/assets.js";
import { buildDefaultConfig, loadGlobalConfig } from "../core/config.js";
import {
	styleCommand,
	styleError,
	styleHint,
	styleLabel,
	styleSuccess,
	styleWarning,
} from "../ui/brand.js";

type CreateCommandOptions = {
	kind?: "prompt" | "skill";
	name?: string;
	home?: string;
	force?: boolean;
	contentFile?: string;
	contentStdin?: boolean;
	title?: string;
	description?: string;
	args?: string;
	content?: string;
	project?: boolean;
	global?: boolean;
	agents: string[];
};

type AssetKind = "prompt" | "skill";

type InstallTarget = {
	id: string;
	label: string;
	path: string;
	hint?: string;
};

type CreateTarget = {
	id: string;
	label: string;
	path: string;
};

export async function runCreateCommand(args: string[]): Promise<number> {
	const parsed = parseCreateArgs(args);
	if (parsed.help) {
		printCreateHelp();
		return 0;
	}

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
	if (parsed.options.agents.length > 0) {
		const invalidAgents = parsed.options.agents.filter(
			(agent) => !["codex", "claude", "agents"].includes(agent),
		);
		if (invalidAgents.length > 0) {
			process.stderr.write(
				`${styleError(`Invalid agent target(s): ${invalidAgents.join(", ")}`)} ${styleHint(
					"Use -a codex|claude|agents.",
				)}\n`,
			);
			return 2;
		}
	}

	const shouldWriteToHome = !hasExplicitTargetSelection(parsed.options);
	const home = shouldWriteToHome ? await ensureHomeRepoStructure(parsed.options.home) : "";
	if (kind === "prompt") {
		return runCreatePrompt(home, parsed.name ?? parsed.options.name, parsed.options);
	}
	return runCreateSkill(home, parsed.name ?? parsed.options.name, parsed.options);
}

async function runCreatePrompt(
	home: string,
	name: string | undefined,
	options: CreateCommandOptions,
): Promise<number> {
	p.intro(pc.cyan("Create prompt"));

	const promptName = name ?? (await askRequired("Prompt slug/name"));
	if (!promptName) {
		p.cancel("Canceled.");
		return 130;
	}
	const slug = slugifyName(promptName);
	if (!slug) {
		p.log.error("Prompt name resolves to an empty slug.");
		return 2;
	}

	const title =
		options.title && options.title.trim().length > 0
			? options.title.trim()
			: await askWithDefault("Prompt title", toTitleCase(slug));
	if (!title) {
		p.cancel("Canceled.");
		return 130;
	}

	const description =
		options.description && options.description.trim().length > 0
			? options.description.trim()
			: await askRequired("Description");
	if (!description) {
		p.cancel("Canceled.");
		return 130;
	}

	const promptArgs =
		options.args !== undefined ? options.args.trim() : await askWithDefault("Args (optional)", "");
	if (promptArgs === null) {
		p.cancel("Canceled.");
		return 130;
	}

	const content = await resolvePromptContent(options);
	if (!content) {
		p.cancel("Canceled.");
		return 130;
	}

	const contentLines = [content];
	if (promptArgs && promptArgs.length > 0 && !content.includes("$ARGUMENTS")) {
		contentLines.push("", "$ARGUMENTS");
	}

	const fileContents = [
		"---",
		`description: ${description}`,
		...(promptArgs ? [`args: ${promptArgs}`] : []),
		"---",
		"",
		`# ${title}`,
		"",
		...contentLines,
		"",
	].join("\n");

	const targets = await resolveCreateTargets({
		kind: "prompt",
		assetId: slug,
		home,
		options,
	});
	const writeResult = await writePromptToTargets(targets, fileContents, Boolean(options.force));
	if (writeResult.canceled) {
		p.cancel("Canceled.");
		return 130;
	}
	if (writeResult.failed > 0 && writeResult.created === 0) {
		return 1;
	}

	let installCount = 0;
	if (!hasExplicitTargetSelection(options) && writeResult.created > 0) {
		const installResult = await maybeInstallCreatedAsset({
			kind: "prompt",
			assetId: slug,
			home,
			force: Boolean(options.force),
		});
		if (installResult === "canceled") {
			p.cancel("Canceled.");
			return 130;
		}
		installCount = installResult.installedCount;
	}

	const summary = [
		pc.green(`Created prompt in ${writeResult.created} destination(s)`),
		installCount > 0 ? pc.dim(`installed to ${installCount} destination(s)`) : "",
	]
		.filter(Boolean)
		.join(" ");
	p.outro(summary);
	return writeResult.failed > 0 ? 1 : 0;
}

async function runCreateSkill(
	home: string,
	name: string | undefined,
	options: CreateCommandOptions,
): Promise<number> {
	p.intro(pc.cyan("Create skill"));
	const skillName = name ?? (await askRequired("Skill name"));
	if (!skillName) {
		p.cancel("Canceled.");
		return 130;
	}
	const slug = slugifyName(skillName);
	if (!slug) {
		p.log.error("Skill name resolves to an empty slug.");
		return 2;
	}

	const description =
		options.description && options.description.trim().length > 0
			? options.description.trim()
			: await askRequired("Description");
	if (!description) {
		p.cancel("Canceled.");
		return 130;
	}

	const template = [
		"---",
		`name: ${slug}`,
		`description: ${description}`,
		"---",
		"",
		`# ${toTitleCase(slug)}`,
		"",
		"Describe when this skill should be used and what the agent should do.",
		"",
	].join("\n");

	const targets = await resolveCreateTargets({
		kind: "skill",
		assetId: slug,
		home,
		options,
	});
	const writeResult = await writeSkillToTargets(targets, template, Boolean(options.force));
	if (writeResult.canceled) {
		p.cancel("Canceled.");
		return 130;
	}
	if (writeResult.failed > 0 && writeResult.created === 0) {
		return 1;
	}

	let installCount = 0;
	if (!hasExplicitTargetSelection(options) && writeResult.created > 0) {
		const installResult = await maybeInstallCreatedAsset({
			kind: "skill",
			assetId: slug,
			home,
			force: Boolean(options.force),
		});
		if (installResult === "canceled") {
			p.cancel("Canceled.");
			return 130;
		}
		installCount = installResult.installedCount;
	}

	const summary = [
		pc.green(`Created skill in ${writeResult.created} destination(s)`),
		installCount > 0 ? pc.dim(`installed to ${installCount} destination(s)`) : "",
	]
		.filter(Boolean)
		.join(" ");
	p.outro(summary);
	return writeResult.failed > 0 ? 1 : 0;
}

async function maybeInstallCreatedAsset(options: {
	kind: AssetKind;
	assetId: string;
	home: string;
	force: boolean;
}): Promise<{ installedCount: number } | "canceled"> {
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		return { installedCount: 0 };
	}

	const confirmInstall = await p.confirm({
		message: `Use this ${options.kind} now by adding it to project/global destinations?`,
		initialValue: false,
	});
	if (p.isCancel(confirmInstall)) {
		return "canceled";
	}
	if (!confirmInstall) {
		return { installedCount: 0 };
	}

	const targets = await buildInstallTargets(options.kind, options.assetId);
	if (targets.length === 0) {
		p.log.info("No installation destinations available.");
		return { installedCount: 0 };
	}

	const selected = await p.multiselect({
		message: "Select installation destinations",
		options: targets.map((target) => ({
			value: target.id,
			label: target.label,
			hint: target.hint,
		})),
	});
	if (p.isCancel(selected)) {
		return "canceled";
	}
	if (selected.length === 0) {
		p.log.info("No destinations selected.");
		return { installedCount: 0 };
	}

	let installedCount = 0;
	for (const selectedId of selected) {
		const target = targets.find((item) => item.id === selectedId);
		if (!target) {
			continue;
		}
		try {
			if (options.kind === "prompt") {
				await copyPromptFromHome({
					home: options.home,
					name: options.assetId,
					targetFile: target.path,
					force: options.force,
				});
			} else {
				await copySkillFromHome({
					home: options.home,
					name: options.assetId,
					targetDir: target.path,
					force: options.force,
				});
			}
			installedCount += 1;
			process.stdout.write(
				`${styleSuccess(`Added ${options.kind} to`)} ${styleLabel(target.label)} ${styleHint(`(${target.path})`)}\n`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			process.stdout.write(`${styleWarning(`Skipped ${target.label}:`)} ${styleHint(message)}\n`);
		}
	}

	return { installedCount };
}

async function buildInstallTargets(kind: AssetKind, assetId: string): Promise<InstallTarget[]> {
	const targets: InstallTarget[] = [];
	const seenPaths = new Set<string>();

	const projectPath =
		kind === "prompt"
			? path.join(process.cwd(), ".agents", "prompts", `${assetId}.md`)
			: path.join(process.cwd(), ".agents", "skills", assetId);
	addInstallTarget(targets, seenPaths, {
		id: "project",
		label: "Project (.agents)",
		path: projectPath,
		hint: projectPath,
	});

	const config = await loadGlobalConfig();
	if (!config) {
		return targets;
	}

	const globalRoots = [
		{ label: "Global: codex", root: config.agents.codex },
		{ label: "Global: claude", root: config.agents.claude },
		{ label: "Global: agents", root: config.agents.agents },
		...config.customSources.map((root, index) => ({
			label: `Global: custom ${index + 1}`,
			root,
		})),
	];

	for (const [index, source] of globalRoots.entries()) {
		const targetPath =
			kind === "prompt"
				? path.join(source.root, "prompts", `${assetId}.md`)
				: path.join(source.root, "skills", assetId);
		addInstallTarget(targets, seenPaths, {
			id: `global-${index}`,
			label: source.label,
			path: targetPath,
			hint: source.root,
		});
	}

	return targets;
}

function addInstallTarget(
	targets: InstallTarget[],
	seenPaths: Set<string>,
	target: InstallTarget,
): void {
	const normalized = path.resolve(target.path);
	if (seenPaths.has(normalized)) {
		return;
	}
	seenPaths.add(normalized);
	targets.push({ ...target, path: normalized });
}

function hasExplicitTargetSelection(options: CreateCommandOptions): boolean {
	return Boolean(options.project || options.global || options.agents.length > 0);
}

async function resolveCreateTargets(input: {
	kind: AssetKind;
	assetId: string;
	home: string;
	options: CreateCommandOptions;
}): Promise<CreateTarget[]> {
	const targets: CreateTarget[] = [];
	const seen = new Set<string>();
	const useExplicitTargets = hasExplicitTargetSelection(input.options);
	const selectedAgents = [...new Set(input.options.agents)];

	if (!useExplicitTargets) {
		const homePath =
			input.kind === "prompt"
				? path.join(input.home, "prompts", `${input.assetId}.md`)
				: path.join(input.home, "skills", input.assetId, "SKILL.md");
		addCreateTarget(targets, seen, {
			id: "home",
			label: "Home",
			path: homePath,
		});
		return targets;
	}

	if (input.options.project) {
		if (selectedAgents.length > 0) {
			for (const agentId of selectedAgents) {
				const projectRoot = projectAgentRoot(agentId);
				const projectPath =
					input.kind === "prompt"
						? path.join(projectRoot, "prompts", `${input.assetId}.md`)
						: path.join(projectRoot, "skills", input.assetId, "SKILL.md");
				addCreateTarget(targets, seen, {
					id: `project-${agentId}`,
					label: `Project: ${agentId}`,
					path: projectPath,
				});
			}
		} else {
			const projectPath =
				input.kind === "prompt"
					? path.join(process.cwd(), ".agents", "prompts", `${input.assetId}.md`)
					: path.join(process.cwd(), ".agents", "skills", input.assetId, "SKILL.md");
			addCreateTarget(targets, seen, {
				id: "project",
				label: "Project",
				path: projectPath,
			});
		}
	}

	const globalRoots = await listGlobalAgentRoots();
	if (input.options.global) {
		const roots =
			selectedAgents.length > 0
				? globalRoots.filter((root) => selectedAgents.includes(root.id))
				: globalRoots;
		for (const root of roots) {
			const targetPath =
				input.kind === "prompt"
					? path.join(root.root, "prompts", `${input.assetId}.md`)
					: path.join(root.root, "skills", input.assetId, "SKILL.md");
			addCreateTarget(targets, seen, {
				id: `global-${root.id}`,
				label: `Global: ${root.label}`,
				path: targetPath,
			});
		}
	}

	if (!input.options.project && !input.options.global && selectedAgents.length > 0) {
		for (const agent of selectedAgents) {
			const matched = globalRoots.find((root) => root.id === agent);
			if (!matched) {
				continue;
			}
			const targetPath =
				input.kind === "prompt"
					? path.join(matched.root, "prompts", `${input.assetId}.md`)
					: path.join(matched.root, "skills", input.assetId, "SKILL.md");
			addCreateTarget(targets, seen, {
				id: `agent-${matched.id}`,
				label: `Agent: ${matched.label}`,
				path: targetPath,
			});
		}
	}

	return targets;
}

function addCreateTarget(targets: CreateTarget[], seen: Set<string>, target: CreateTarget): void {
	const normalized = path.resolve(target.path);
	if (seen.has(normalized)) {
		return;
	}
	seen.add(normalized);
	targets.push({ ...target, path: normalized });
}

async function listGlobalAgentRoots(): Promise<Array<{ id: string; label: string; root: string }>> {
	const stored = await loadGlobalConfig();
	const defaults = buildDefaultConfig(path.join(homedir(), "dotagents"));
	const codex = stored?.agents.codex ?? defaults.agents.codex;
	const claude = stored?.agents.claude ?? defaults.agents.claude;
	const agents = stored?.agents.agents ?? defaults.agents.agents;
	const custom = stored?.customSources ?? [];
	return [
		{ id: "codex", label: "codex", root: codex },
		{ id: "claude", label: "claude", root: claude },
		{ id: "agents", label: "agents", root: agents },
		...custom.map((root, index) => ({
			id: `custom-${index + 1}`,
			label: `custom ${index + 1}`,
			root,
		})),
	];
}

function projectAgentRoot(agentId: string): string {
	if (agentId === "codex") {
		return path.join(process.cwd(), ".codex");
	}
	if (agentId === "claude") {
		return path.join(process.cwd(), ".claude");
	}
	return path.join(process.cwd(), ".agents");
}

async function writePromptToTargets(
	targets: CreateTarget[],
	contents: string,
	force: boolean,
): Promise<{ created: number; failed: number; canceled: boolean }> {
	let created = 0;
	let failed = 0;
	for (const target of targets) {
		const decision = await shouldWriteTarget(target.path, force);
		if (decision === "canceled") {
			return { created, failed, canceled: true };
		}
		if (!decision) {
			process.stdout.write(
				`${styleWarning(`Skipped ${target.label}:`)} ${styleHint("already exists")}\n`,
			);
			continue;
		}
		try {
			await fs.mkdir(path.dirname(target.path), { recursive: true });
			await fs.writeFile(target.path, contents, "utf8");
			created += 1;
			process.stdout.write(
				`${styleSuccess("Created")} ${styleLabel(target.label)} ${styleHint(`(${target.path})`)}\n`,
			);
		} catch (error) {
			failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			process.stdout.write(`${styleError(`Failed ${target.label}:`)} ${styleHint(message)}\n`);
		}
	}
	return { created, failed, canceled: false };
}

async function writeSkillToTargets(
	targets: CreateTarget[],
	contents: string,
	force: boolean,
): Promise<{ created: number; failed: number; canceled: boolean }> {
	let created = 0;
	let failed = 0;
	for (const target of targets) {
		const decision = await shouldWriteTarget(target.path, force);
		if (decision === "canceled") {
			return { created, failed, canceled: true };
		}
		if (!decision) {
			process.stdout.write(
				`${styleWarning(`Skipped ${target.label}:`)} ${styleHint("already exists")}\n`,
			);
			continue;
		}
		try {
			await fs.mkdir(path.dirname(target.path), { recursive: true });
			await fs.writeFile(target.path, contents, "utf8");
			created += 1;
			process.stdout.write(
				`${styleSuccess("Created")} ${styleLabel(target.label)} ${styleHint(`(${target.path})`)}\n`,
			);
		} catch (error) {
			failed += 1;
			const message = error instanceof Error ? error.message : String(error);
			process.stdout.write(`${styleError(`Failed ${target.label}:`)} ${styleHint(message)}\n`);
		}
	}
	return { created, failed, canceled: false };
}

async function shouldWriteTarget(
	targetPath: string,
	force: boolean,
): Promise<boolean | "canceled"> {
	const exists = await existsPath(targetPath);
	if (!exists || force) {
		return true;
	}
	if (!process.stdout.isTTY || !process.stdin.isTTY) {
		throw new Error(`Target already exists: ${targetPath}. Use --force to overwrite.`);
	}
	const confirm = await p.confirm({
		message: `${targetPath} exists. Overwrite?`,
		initialValue: false,
	});
	if (p.isCancel(confirm)) {
		return "canceled";
	}
	return confirm;
}

async function askRequired(message: string): Promise<string | null> {
	const value = await p.text({
		message,
		validate(input) {
			if (!toTrimmedString(input)) {
				return "This field is required.";
			}
			return undefined;
		},
	});
	if (p.isCancel(value)) {
		return null;
	}
	return toTrimmedString(value);
}

async function askWithDefault(message: string, defaultValue: string): Promise<string | null> {
	const value = await p.text({
		message,
		initialValue: defaultValue,
	});
	if (p.isCancel(value)) {
		return null;
	}
	return toTrimmedString(value);
}

async function resolvePromptContent(options: CreateCommandOptions): Promise<string | null> {
	if (options.content !== undefined) {
		const content = options.content.trimEnd();
		return content.length > 0 ? content : null;
	}

	if (options.contentFile) {
		const raw = await fs.readFile(path.resolve(options.contentFile), "utf8");
		const content = raw.trimEnd();
		return content.length > 0 ? content : null;
	}

	if (options.contentStdin || !process.stdout.isTTY) {
		const raw = await readAllStdin();
		const content = raw.trimEnd();
		return content.length > 0 ? content : null;
	}

	const mode = await p.select({
		message: "Prompt content input mode",
		options: [
			{
				value: "multiline",
				label: "Paste multiline markdown (end with EOF)",
			},
			{
				value: "single",
				label: "Single line input",
			},
		],
	});
	if (p.isCancel(mode)) {
		return null;
	}

	if (mode === "single") {
		return await askRequired("Prompt content");
	}

	return await readMultilineInput();
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

async function readMultilineInput(): Promise<string | null> {
	p.log.info("Paste markdown content below. End input with a line containing only: EOF");

	const lines: string[] = [];
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});

	return await new Promise<string | null>((resolve) => {
		const finish = () => {
			rl.close();
			const content = lines.join("\n").trimEnd();
			resolve(content.length > 0 ? content : null);
		};

		rl.on("line", (line) => {
			if (line === "EOF") {
				finish();
				return;
			}
			lines.push(line);
		});
		rl.on("close", () => {
			const content = lines.join("\n").trimEnd();
			resolve(content.length > 0 ? content : null);
		});
	});
}

async function readAllStdin(): Promise<string> {
	if (process.stdin.isTTY) {
		return "";
	}
	let content = "";
	for await (const chunk of process.stdin) {
		content += chunk;
	}
	return content;
}

function parseCreateArgs(args: string[]): {
	kind?: string;
	name?: string;
	help?: boolean;
	options: CreateCommandOptions;
} {
	const positionals: string[] = [];
	const options: CreateCommandOptions = { agents: [] };

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
			const parsedAgents = value
				.split(",")
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean);
			options.agents = [...options.agents, ...parsedAgents];
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
		if (arg === "--content-file") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --content-file");
			}
			options.contentFile = value;
			index += 1;
			continue;
		}
		if (arg === "--content-stdin") {
			options.contentStdin = true;
			continue;
		}
		if (arg === "--title") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --title");
			}
			options.title = value;
			index += 1;
			continue;
		}
		if (arg === "--description") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --description");
			}
			options.description = value;
			index += 1;
			continue;
		}
		if (arg === "--args") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --args");
			}
			options.args = value;
			index += 1;
			continue;
		}
		if (arg === "--content") {
			const value = args[index + 1];
			if (!value || value.startsWith("-")) {
				throw new Error("Missing value for --content");
			}
			options.content = value;
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

function printCreateHelp(): void {
	process.stdout.write(
		`Usage: ${styleCommand("dotagents create [prompt|skill] [name] [--kind <prompt|skill>] [--name <slug>] [--title <title>] [--description <text>] [--args <text>] [--content <text>|--content-file <path>|--content-stdin] [--home <path>] [--project|-p] [--global|-g] [--agent|-a <name>] [--force]")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("Use --content-file or --content-stdin for large markdown prompts.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("If kind is omitted in interactive mode, you'll choose prompt or skill.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("-p creates in project, -g creates in global agent homes, -a targets specific agents.")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("Combine -p and -a to target agent-local project paths (for example: ./.codex or ./.claude).")}\n`,
	);
	process.stdout.write(
		`  ${styleHint("After creation, interactive mode can install the asset to project and/or global agent paths.")}\n`,
	);
	process.stdout.write(`  ${styleHint("`dotagents new` remains supported as an alias.")}\n`);
}

function toTitleCase(value: string): string {
	return value
		.split(/[/-]/g)
		.filter(Boolean)
		.map((chunk) => chunk.slice(0, 1).toUpperCase() + chunk.slice(1))
		.join(" ");
}

async function existsPath(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

function toTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
