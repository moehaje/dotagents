import fs from "node:fs/promises";
import path from "node:path";
import { hashDirectory, stageSkillSource } from "./skills-cli.js";

export type AgentsManifestSkill = {
	id: string;
	source: string;
};

export type AgentsManifest = {
	project?: {
		name?: string;
		version?: string;
	};
	skills: AgentsManifestSkill[];
};

export type AgentsLockSkill = {
	id: string;
	source: string;
	resolved: string;
	integrity: string;
};

export type AgentsLock = {
	version: 1;
	skills: AgentsLockSkill[];
};

export async function loadAgentsManifest(filePath: string): Promise<AgentsManifest> {
	const raw = await fs.readFile(filePath, "utf8");
	return parseAgentsManifest(raw, filePath);
}

export function parseAgentsManifest(raw: string, sourceName = "agents.toml"): AgentsManifest {
	const parsed = parseTomlSections(raw, sourceName);
	const project = parsed.project;
	const skills = parsed.skills.map((skill, index) => {
		const id = requiredValue(skill.id, sourceName, `skills[${index + 1}].id`);
		const source = requiredValue(skill.source, sourceName, `skills[${index + 1}].source`);
		return { id, source };
	});
	if (skills.length === 0) {
		throw new Error(`${sourceName}: expected at least one [[skills]] entry.`);
	}
	const seen = new Set<string>();
	for (const skill of skills) {
		if (seen.has(skill.id)) {
			throw new Error(`${sourceName}: duplicate skill id "${skill.id}" in [[skills]].`);
		}
		seen.add(skill.id);
	}
	return {
		project: project.name || project.version ? project : undefined,
		skills: skills.sort((left, right) => left.id.localeCompare(right.id)),
	};
}

export async function loadAgentsLock(filePath: string): Promise<AgentsLock> {
	const raw = await fs.readFile(filePath, "utf8");
	return parseAgentsLock(raw, filePath);
}

export function parseAgentsLock(raw: string, sourceName = "agents.lock.toml"): AgentsLock {
	const parsed = parseTomlSections(raw, sourceName);
	const versionText = parsed.topLevel.version;
	if (versionText !== "1") {
		throw new Error(`${sourceName}: version must be 1.`);
	}
	const skills = parsed.skills.map((skill, index) => ({
		id: requiredValue(skill.id, sourceName, `skills[${index + 1}].id`),
		source: requiredValue(skill.source, sourceName, `skills[${index + 1}].source`),
		resolved: requiredValue(skill.resolved, sourceName, `skills[${index + 1}].resolved`),
		integrity: requiredValue(skill.integrity, sourceName, `skills[${index + 1}].integrity`),
	}));
	const seen = new Set<string>();
	for (const skill of skills) {
		if (seen.has(skill.id)) {
			throw new Error(`${sourceName}: duplicate skill id "${skill.id}" in [[skills]].`);
		}
		seen.add(skill.id);
	}
	return {
		version: 1,
		skills: skills.sort((left, right) => left.id.localeCompare(right.id)),
	};
}

export async function resolveAgentsLock(
	manifest: AgentsManifest,
	options?: {
		resolveSkill?: (skill: AgentsManifestSkill) => Promise<Omit<AgentsLockSkill, "id" | "source">>;
	},
): Promise<AgentsLock> {
	const resolveSkill = options?.resolveSkill ?? resolveLockSkillFromSource;
	const skills: AgentsLockSkill[] = [];
	for (const skill of manifest.skills) {
		const resolved = await resolveSkill(skill);
		skills.push({
			id: skill.id,
			source: skill.source,
			resolved: resolved.resolved,
			integrity: resolved.integrity,
		});
	}
	return {
		version: 1,
		skills: skills.sort((left, right) => left.id.localeCompare(right.id)),
	};
}

export async function writeAgentsLock(filePath: string, lock: AgentsLock): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, serializeAgentsLock(lock), "utf8");
}

export function serializeAgentsLock(lock: AgentsLock): string {
	const lines: string[] = [];
	lines.push(`version = ${lock.version}`);
	for (const skill of [...lock.skills].sort((left, right) => left.id.localeCompare(right.id))) {
		lines.push("");
		lines.push("[[skills]]");
		lines.push(`id = ${quoteTomlString(skill.id)}`);
		lines.push(`source = ${quoteTomlString(skill.source)}`);
		lines.push(`resolved = ${quoteTomlString(skill.resolved)}`);
		lines.push(`integrity = ${quoteTomlString(skill.integrity)}`);
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
}

export async function installSkillsFromLock(
	lock: AgentsLock,
	options?: {
		projectRoot?: string;
		stageSkill?: (
			sourceSpec: string,
		) => Promise<{ success: boolean; skillDir?: string; hash?: string; message?: string }>;
	},
): Promise<Array<{ id: string; installed: boolean; message?: string }>> {
	const projectRoot = options?.projectRoot ?? process.cwd();
	const stageSkill = options?.stageSkill ?? ((sourceSpec: string) => stageSkillSource(sourceSpec));
	const targetRoot = path.join(projectRoot, ".agents", "skills");
	await fs.mkdir(targetRoot, { recursive: true });

	const results: Array<{ id: string; installed: boolean; message?: string }> = [];
	for (const skill of lock.skills) {
		const staged = await stageSkill(skill.resolved);
		if (!staged.success || !staged.skillDir) {
			results.push({
				id: skill.id,
				installed: false,
				message: staged.message ?? "Failed to stage skill",
			});
			continue;
		}
		const expectedIntegrity = normalizeIntegrity(skill.integrity);
		const stagedIntegrity = staged.hash ?? (await hashDirectory(staged.skillDir));
		if (expectedIntegrity !== stagedIntegrity) {
			await fs.rm(staged.skillDir, { recursive: true, force: true });
			results.push({
				id: skill.id,
				installed: false,
				message: `Integrity mismatch for ${skill.id}`,
			});
			continue;
		}
		const targetDir = path.join(targetRoot, skill.id);
		await fs.mkdir(path.dirname(targetDir), { recursive: true });
		await fs.rm(targetDir, { recursive: true, force: true });
		await fs.cp(staged.skillDir, targetDir, { recursive: true, force: true });
		await fs.rm(staged.skillDir, { recursive: true, force: true });
		results.push({ id: skill.id, installed: true });
	}
	return results;
}

export async function checkInstalledSkillsAgainstLock(
	lock: AgentsLock,
	options?: { projectRoot?: string },
): Promise<Array<{ id: string; status: "ok" | "missing" | "mismatch"; message?: string }>> {
	const projectRoot = options?.projectRoot ?? process.cwd();
	const output: Array<{ id: string; status: "ok" | "missing" | "mismatch"; message?: string }> = [];
	for (const skill of lock.skills) {
		const targetDir = path.join(projectRoot, ".agents", "skills", skill.id);
		if (!(await pathExists(targetDir))) {
			output.push({ id: skill.id, status: "missing", message: "Skill directory is missing." });
			continue;
		}
		const localIntegrity = await hashDirectory(targetDir);
		if (localIntegrity !== normalizeIntegrity(skill.integrity)) {
			output.push({ id: skill.id, status: "mismatch", message: "Integrity mismatch." });
			continue;
		}
		output.push({ id: skill.id, status: "ok" });
	}
	return output;
}

async function resolveLockSkillFromSource(
	skill: AgentsManifestSkill,
): Promise<Omit<AgentsLockSkill, "id" | "source">> {
	const staged = await stageSkillSource(skill.source, { tempPrefix: "dotagents-skill-lock-" });
	if (!staged.success || !staged.skillDir || !staged.hash) {
		throw new Error(staged.message ?? `Could not resolve skill source: ${skill.source}`);
	}
	await fs.rm(staged.skillDir, { recursive: true, force: true });
	return {
		resolved: skill.source,
		integrity: `sha256:${staged.hash}`,
	};
}

function normalizeIntegrity(integrity: string): string {
	return integrity.startsWith("sha256:") ? integrity.slice("sha256:".length) : integrity;
}

function quoteTomlString(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function requiredValue(value: string | undefined, sourceName: string, field: string): string {
	if (!value || value.trim().length === 0) {
		throw new Error(`${sourceName}: missing required field ${field}.`);
	}
	return value;
}

function parseTomlSections(
	raw: string,
	sourceName: string,
): {
	topLevel: Record<string, string>;
	project: { name?: string; version?: string };
	skills: Array<{ id?: string; source?: string; resolved?: string; integrity?: string }>;
} {
	const topLevel: Record<string, string> = {};
	const project: { name?: string; version?: string } = {};
	const skills: Array<{ id?: string; source?: string; resolved?: string; integrity?: string }> = [];
	let section: "top" | "project" | "skills" = "top";
	for (const line of raw.split(/\r?\n/)) {
		const withoutComments = stripTomlComment(line).trim();
		if (!withoutComments) {
			continue;
		}
		if (withoutComments === "[project]") {
			section = "project";
			continue;
		}
		if (withoutComments === "[[skills]]") {
			section = "skills";
			skills.push({});
			continue;
		}
		const match = withoutComments.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
		if (!match) {
			throw new Error(`${sourceName}: invalid TOML line "${withoutComments}".`);
		}
		const key = match[1];
		const value = parseTomlValue(match[2], sourceName, key);
		if (section === "top") {
			topLevel[key] = value;
			continue;
		}
		if (section === "project") {
			if (key !== "name" && key !== "version") {
				throw new Error(`${sourceName}: unsupported [project] key "${key}".`);
			}
			project[key] = value;
			continue;
		}
		if (skills.length === 0) {
			throw new Error(`${sourceName}: found skills value before [[skills]] section.`);
		}
		const current = skills[skills.length - 1];
		if (key !== "id" && key !== "source" && key !== "resolved" && key !== "integrity") {
			throw new Error(`${sourceName}: unsupported [[skills]] key "${key}".`);
		}
		current[key] = value;
	}
	return { topLevel, project, skills };
}

function stripTomlComment(line: string): string {
	let inQuotes = false;
	let escaped = false;
	for (let index = 0; index < line.length; index += 1) {
		const ch = line[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"') {
			inQuotes = !inQuotes;
			continue;
		}
		if (ch === "#" && !inQuotes) {
			return line.slice(0, index);
		}
	}
	return line;
}

function parseTomlValue(valueRaw: string, sourceName: string, key: string): string {
	const value = valueRaw.trim();
	if (/^[0-9]+$/.test(value)) {
		return value;
	}
	if (value.startsWith('"') && value.endsWith('"')) {
		return value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
	}
	throw new Error(`${sourceName}: unsupported value for "${key}" (expected string or integer).`);
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
