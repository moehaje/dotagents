import fs from "node:fs/promises";
import path from "node:path";
import { listHomeSkillIds, listPromptIdsFromRoot, slugifyName } from "./assets.js";
import type { AssetKind } from "./types.js";

export type CheckSeverity = "error" | "warning";

export type AssetCheckIssue = {
	severity: CheckSeverity;
	code: string;
	message: string;
	path: string;
	hint?: string;
};

export type AssetCheckResult = {
	kind: AssetKind;
	id: string;
	path: string;
	issues: AssetCheckIssue[];
};

export type AssetKindCheckSummary = {
	checked: number;
	errors: number;
	warnings: number;
	results: AssetCheckResult[];
};

export type CheckSummary = {
	home: string;
	valid: boolean;
	errorCount: number;
	warningCount: number;
	prompts: AssetKindCheckSummary;
	skills: AssetKindCheckSummary;
};

type FrontmatterParseResult =
	| { ok: true; fields: Map<string, string> }
	| { ok: false; code: "frontmatter.missing" | "frontmatter.invalid" };

export async function runAssetChecks(options: {
	home: string;
	kindFilter?: AssetKind;
}): Promise<CheckSummary> {
	const promptResults =
		options.kindFilter === "skill" ? [] : await checkPrompts(path.resolve(options.home));
	const skillResults =
		options.kindFilter === "prompt" ? [] : await checkSkills(path.resolve(options.home));

	const prompts = summarizeKind(promptResults);
	const skills = summarizeKind(skillResults);
	const errorCount = prompts.errors + skills.errors;
	const warningCount = prompts.warnings + skills.warnings;

	return {
		home: path.resolve(options.home),
		valid: errorCount === 0,
		errorCount,
		warningCount,
		prompts,
		skills,
	};
}

async function checkPrompts(home: string): Promise<AssetCheckResult[]> {
	const promptIds = [...(await listPromptIdsFromRoot(home))].sort((left, right) =>
		left.localeCompare(right),
	);
	const results: AssetCheckResult[] = [];

	for (const id of promptIds) {
		const promptPath = path.join(home, "prompts", `${id}.md`);
		const issues: AssetCheckIssue[] = [];
		const content = await readFileSafe(promptPath);
		if (!content.ok) {
			issues.push({
				severity: "error",
				code: "prompt.read.failed",
				message: "Could not read prompt file.",
				path: promptPath,
			});
			results.push({
				kind: "prompt",
				id,
				path: promptPath,
				issues,
			});
			continue;
		}

		const frontmatter = parseFrontmatter(content.value);
		if (!frontmatter.ok) {
			issues.push({
				severity: "error",
				code:
					frontmatter.code === "frontmatter.missing"
						? "prompt.frontmatter.missing"
						: "prompt.frontmatter.invalid",
				message:
					frontmatter.code === "frontmatter.missing"
						? "Prompt frontmatter block is missing."
						: "Prompt frontmatter block is invalid.",
				path: promptPath,
			});
		} else if (!frontmatter.fields.get("description")?.trim()) {
			issues.push({
				severity: "error",
				code: "prompt.description.missing",
				message: "Prompt frontmatter must include non-empty `description`.",
				path: promptPath,
			});
		}

		results.push({
			kind: "prompt",
			id,
			path: promptPath,
			issues,
		});
	}

	return results;
}

async function checkSkills(home: string): Promise<AssetCheckResult[]> {
	const skillIds = [...(await listHomeSkillIds(home))].sort((left, right) =>
		left.localeCompare(right),
	);
	const checkedIds = new Set(skillIds);
	const results: AssetCheckResult[] = [];

	for (const id of skillIds) {
		results.push(await validateSkill(home, id));
	}

	const directChildren = await listDirectSkillDirectoryIds(home);
	for (const id of directChildren) {
		if (checkedIds.has(id)) {
			continue;
		}
		const skillDir = path.join(home, "skills", id);
		results.push({
			kind: "skill",
			id,
			path: skillDir,
			issues: [
				{
					severity: "error",
					code: "skill.file.missing",
					message: "Skill directory is missing `SKILL.md`.",
					path: path.join(skillDir, "SKILL.md"),
				},
			],
		});
	}

	return results.sort((left, right) => left.id.localeCompare(right.id));
}

async function validateSkill(home: string, id: string): Promise<AssetCheckResult> {
	const skillDir = path.join(home, "skills", id);
	const skillFile = path.join(skillDir, "SKILL.md");
	const issues: AssetCheckIssue[] = [];

	if (!(await pathExists(skillFile))) {
		issues.push({
			severity: "error",
			code: "skill.file.missing",
			message: "Skill directory is missing `SKILL.md`.",
			path: skillFile,
		});
		return {
			kind: "skill",
			id,
			path: skillDir,
			issues,
		};
	}

	const content = await readFileSafe(skillFile);
	if (!content.ok) {
		issues.push({
			severity: "error",
			code: "skill.read.failed",
			message: "Could not read `SKILL.md`.",
			path: skillFile,
		});
		return {
			kind: "skill",
			id,
			path: skillDir,
			issues,
		};
	}

	const frontmatter = parseFrontmatter(content.value);
	if (!frontmatter.ok) {
		issues.push({
			severity: "error",
			code:
				frontmatter.code === "frontmatter.missing"
					? "skill.frontmatter.missing"
					: "skill.frontmatter.invalid",
			message:
				frontmatter.code === "frontmatter.missing"
					? "Skill frontmatter block is missing."
					: "Skill frontmatter block is invalid.",
			path: skillFile,
		});
		return {
			kind: "skill",
			id,
			path: skillDir,
			issues,
		};
	}

	const frontmatterName = frontmatter.fields.get("name")?.trim() ?? "";
	const frontmatterDescription = frontmatter.fields.get("description")?.trim() ?? "";

	if (!frontmatterName) {
		issues.push({
			severity: "error",
			code: "skill.name.missing",
			message: "Skill frontmatter must include non-empty `name`.",
			path: skillFile,
		});
	}
	if (!frontmatterDescription) {
		issues.push({
			severity: "error",
			code: "skill.description.missing",
			message: "Skill frontmatter must include non-empty `description`.",
			path: skillFile,
		});
	}

	if (frontmatterName) {
		const normalizedName = slugifyName(frontmatterName);
		if (normalizedName !== id) {
			issues.push({
				severity: "warning",
				code: "skill.name.mismatch",
				message: "Skill frontmatter `name` differs from directory slug.",
				path: skillFile,
				hint: `Expected: ${id}, found: ${frontmatterName}`,
			});
		}
	}

	return {
		kind: "skill",
		id,
		path: skillDir,
		issues,
	};
}

function summarizeKind(results: AssetCheckResult[]): AssetKindCheckSummary {
	let errors = 0;
	let warnings = 0;
	for (const result of results) {
		for (const issue of result.issues) {
			if (issue.severity === "error") {
				errors += 1;
				continue;
			}
			warnings += 1;
		}
	}
	return {
		checked: results.length,
		errors,
		warnings,
		results,
	};
}

function parseFrontmatter(content: string): FrontmatterParseResult {
	const normalized = content.replace(/^\uFEFF/, "");
	const lines = normalized.split(/\r?\n/);
	if (lines.length === 0 || lines[0]?.trim() !== "---") {
		return { ok: false, code: "frontmatter.missing" };
	}

	let closingIndex = -1;
	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index]?.trim() === "---") {
			closingIndex = index;
			break;
		}
	}
	if (closingIndex === -1) {
		return { ok: false, code: "frontmatter.invalid" };
	}

	const fields = new Map<string, string>();
	for (const line of lines.slice(1, closingIndex)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}
		const separator = trimmed.indexOf(":");
		if (separator <= 0) {
			return { ok: false, code: "frontmatter.invalid" };
		}
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		if (!key) {
			return { ok: false, code: "frontmatter.invalid" };
		}
		fields.set(key, value);
	}

	return { ok: true, fields };
}

async function listDirectSkillDirectoryIds(home: string): Promise<string[]> {
	const skillsRoot = path.join(home, "skills");
	let entries: Array<{ name: string; isDirectory: () => boolean }>;
	try {
		entries = await fs.readdir(skillsRoot, { withFileTypes: true });
	} catch {
		return [];
	}

	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));
}

async function readFileSafe(
	filePath: string,
): Promise<{ ok: true; value: string } | { ok: false }> {
	try {
		const value = await fs.readFile(filePath, "utf8");
		return { ok: true, value };
	} catch {
		return { ok: false };
	}
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
