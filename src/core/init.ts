import fs from "node:fs/promises";
import path from "node:path";

export type InitScaffoldEntry = {
	path: string;
	type: "dir" | "file";
	action: "created" | "updated" | "skipped";
};

export async function createProjectScaffold(options: {
	projectRoot?: string;
	force?: boolean;
}): Promise<InitScaffoldEntry[]> {
	const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
	const force = Boolean(options.force);
	const agentsRoot = path.join(projectRoot, ".agents");
	const entries: InitScaffoldEntry[] = [];

	for (const dirPath of [
		agentsRoot,
		path.join(agentsRoot, "prompts"),
		path.join(agentsRoot, "skills"),
	]) {
		const existed = await pathExists(dirPath);
		await fs.mkdir(dirPath, { recursive: true });
		entries.push({
			path: dirPath,
			type: "dir",
			action: existed ? "skipped" : "created",
		});
	}

	const files = [
		{
			path: path.join(agentsRoot, "AGENTS.md"),
			content: projectAgentsTemplate(path.basename(projectRoot)),
		},
		{
			path: path.join(agentsRoot, "README.md"),
			content: projectReadmeTemplate(),
		},
	];

	for (const file of files) {
		const existed = await pathExists(file.path);
		if (existed && !force) {
			entries.push({
				path: file.path,
				type: "file",
				action: "skipped",
			});
			continue;
		}
		await fs.writeFile(file.path, file.content, "utf8");
		entries.push({
			path: file.path,
			type: "file",
			action: existed ? "updated" : "created",
		});
	}

	return entries;
}

function projectAgentsTemplate(projectName: string): string {
	return [
		`# ${projectName || "project"}`,
		"",
		"Use this file for project-specific instructions that complement your global home assets.",
		"",
		"## Local conventions",
		"",
		"- Keep project prompts in `.agents/prompts/`.",
		"- Keep project skills in `.agents/skills/`.",
		"- Prefer non-interactive command usage in automation.",
		"",
	].join("\n");
}

function projectReadmeTemplate(): string {
	return [
		"# .agents",
		"",
		"This directory contains project-local prompt and skill assets used by dotagents-compatible tools.",
		"",
		"## Layout",
		"",
		"- `prompts/`: markdown prompt files",
		"- `skills/`: skill directories containing `SKILL.md`",
		"",
	].join("\n");
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
