import fs from "node:fs/promises";
import path from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { ensureHomeRepoStructure, slugifyName } from "../core/assets.js";

type NewCommandOptions = {
	home?: string;
	force?: boolean;
};

export async function runNewCommand(args: string[]): Promise<number> {
	const parsed = parseNewArgs(args);
	if (parsed.help) {
		printNewHelp();
		return 0;
	}

	const kind = parsed.kind ?? "prompt";
	if (kind !== "prompt" && kind !== "skill") {
		process.stderr.write(`Invalid asset kind: ${kind}. Use prompt or skill.\n`);
		return 2;
	}

	const home = await ensureHomeRepoStructure(parsed.options.home);
	if (kind === "prompt") {
		return runNewPrompt(home, parsed.name, parsed.options);
	}
	return runNewSkill(home, parsed.name, parsed.options);
}

async function runNewPrompt(home: string, name: string | undefined, options: NewCommandOptions): Promise<number> {
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

	const title = await askWithDefault("Prompt title", toTitleCase(slug));
	if (!title) {
		p.cancel("Canceled.");
		return 130;
	}

	const description = await askRequired("Description");
	if (!description) {
		p.cancel("Canceled.");
		return 130;
	}

	const promptArgs = await askWithDefault("Args (optional)", "");
	if (promptArgs === null) {
		p.cancel("Canceled.");
		return 130;
	}

	const content = await askRequired("Prompt content");
	if (!content) {
		p.cancel("Canceled.");
		return 130;
	}

	const promptFile = path.join(home, "prompts", `${slug}.md`);
	const exists = await existsPath(promptFile);
	if (exists && !options.force) {
		const confirm = await p.confirm({
			message: `${promptFile} exists. Overwrite?`,
			initialValue: false,
		});
		if (p.isCancel(confirm) || !confirm) {
			p.cancel("Canceled.");
			return 130;
		}
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

	await fs.mkdir(path.dirname(promptFile), { recursive: true });
	await fs.writeFile(promptFile, fileContents, "utf8");

	p.outro(pc.green(`Created ${promptFile}`));
	return 0;
}

async function runNewSkill(home: string, name: string | undefined, options: NewCommandOptions): Promise<number> {
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

	const description = await askRequired("Description");
	if (!description) {
		p.cancel("Canceled.");
		return 130;
	}

	const skillDir = path.join(home, "skills", slug);
	const skillFile = path.join(skillDir, "SKILL.md");

	const exists = await existsPath(skillFile);
	if (exists && !options.force) {
		const confirm = await p.confirm({
			message: `${skillFile} exists. Overwrite?`,
			initialValue: false,
		});
		if (p.isCancel(confirm) || !confirm) {
			p.cancel("Canceled.");
			return 130;
		}
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

	await fs.mkdir(skillDir, { recursive: true });
	await fs.writeFile(skillFile, template, "utf8");

	p.outro(pc.green(`Created ${skillFile}`));
	return 0;
}

async function askRequired(message: string): Promise<string | null> {
	const value = await p.text({
		message,
		validate(input) {
			if (!input.trim()) {
				return "This field is required.";
			}
			return undefined;
		},
	});
	if (p.isCancel(value)) {
		return null;
	}
	return value.trim();
}

async function askWithDefault(message: string, defaultValue: string): Promise<string | null> {
	const value = await p.text({
		message,
		initialValue: defaultValue,
	});
	if (p.isCancel(value)) {
		return null;
	}
	return value.trim();
}

function parseNewArgs(args: string[]): {
	kind?: string;
	name?: string;
	help?: boolean;
	options: NewCommandOptions;
} {
	const positionals: string[] = [];
	const options: NewCommandOptions = {};

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
		positionals.push(arg);
	}

	return {
		kind: positionals[0],
		name: positionals[1],
		options,
	};
}

function printNewHelp(): void {
	process.stdout.write("Usage: dotagents new <prompt|skill> [name] [--home <path>] [--force]\n");
}

function toTitleCase(value: string): string {
	return value
		.split(/[\/-]/g)
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
