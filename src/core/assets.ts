import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolveHomeRepository, type ScanSource } from "./config.js";
import type { DiscoveredAsset, ScanReport } from "./types.js";

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo"]);

const PROMPT_SOURCE_DIRS = [
	"prompts",
	"commands",
	".agents/prompts",
	".claude/prompts",
	".claude/commands",
	".codex/prompts",
] as const;

const SKILL_SOURCE_DIRS = ["skills", ".agents/skills", ".claude/skills", ".codex/skills"] as const;
const execFileAsync = promisify(execFile);
export type InstallMode = "copy" | "symlink";

export function slugifyName(input: string): string {
	const normalized = input
		.trim()
		.toLowerCase()
		.replace(/\.md$/i, "")
		.replace(/[^a-z0-9._/]+/g, "-")
		.replace(/\/{2,}/g, "/")
		.replace(/-{2,}/g, "-")
		.replace(/^[-/.]+|[-/.]+$/g, "");

	return normalized
		.split("/")
		.filter((segment) => segment.length > 0 && segment !== "." && segment !== "..")
		.join("/");
}

export async function ensureHomeRepoStructure(explicitHome?: string): Promise<string> {
	const home = await resolveHomeRepository(explicitHome);
	await fs.mkdir(path.join(home, "prompts"), { recursive: true });
	await fs.mkdir(path.join(home, "skills"), { recursive: true });
	return home;
}

export function promptFileFromName(home: string, inputName: string): string {
	const normalized = inputName.endsWith(".md") ? inputName : `${inputName}.md`;
	return path.join(home, "prompts", normalized);
}

export function skillDirFromName(home: string, inputName: string): string {
	return path.join(home, "skills", inputName);
}

export async function listHomePromptIds(home: string): Promise<Set<string>> {
	return await listPromptIdsFromRoot(home);
}

export async function listHomeSkillIds(home: string): Promise<Set<string>> {
	return await listSkillIdsFromRoot(home);
}

export async function listPromptIdsFromRoot(root: string): Promise<Set<string>> {
	const promptsDir = path.join(root, "prompts");
	const files = await listMarkdownFiles(promptsDir);
	const ids = new Set<string>();
	for (const file of files) {
		const rel = toPosix(path.relative(promptsDir, file));
		ids.add(stripMarkdownExt(rel));
	}
	return ids;
}

export async function listSkillIdsFromRoot(root: string): Promise<Set<string>> {
	const skillsDir = path.join(root, "skills");
	const directories = await discoverSkillDirectories(skillsDir);
	const ids = new Set<string>();
	for (const dir of directories) {
		const rel = toPosix(path.relative(skillsDir, dir));
		ids.add(rel);
	}
	return ids;
}

export async function copyPromptFromHome(options: {
	home: string;
	name: string;
	targetFile: string;
	force?: boolean;
}): Promise<void> {
	await installPromptFromHome({
		...options,
		mode: "copy",
	});
}

export async function installPromptFromHome(options: {
	home: string;
	name: string;
	targetFile: string;
	mode: InstallMode;
	force?: boolean;
}): Promise<void> {
	const source = promptFileFromName(options.home, options.name);
	await assertPathExists(source, "Prompt not found");
	if (options.mode === "copy") {
		await copyFile(options.targetFile, source, Boolean(options.force));
		return;
	}
	await createSymlink(options.targetFile, source, Boolean(options.force), "file");
}

export async function copySkillFromHome(options: {
	home: string;
	name: string;
	targetDir: string;
	force?: boolean;
}): Promise<void> {
	await installSkillFromHome({
		...options,
		mode: "copy",
	});
}

export async function installSkillFromHome(options: {
	home: string;
	name: string;
	targetDir: string;
	mode: InstallMode;
	force?: boolean;
}): Promise<void> {
	const source = skillDirFromName(options.home, options.name);
	await assertPathExists(source, "Skill not found");
	if (options.mode === "copy") {
		await copyDirectory(options.targetDir, source, Boolean(options.force));
		return;
	}
	await createSymlink(options.targetDir, source, Boolean(options.force), "dir");
}

export async function scanUnsyncedAssets(options: {
	home: string;
	sources: ScanSource[];
}): Promise<ScanReport> {
	const [homePrompts, homeSkills] = await Promise.all([
		listHomePromptIds(options.home),
		listHomeSkillIds(options.home),
	]);

	const discovered = (
		await Promise.all(
			options.sources.map(async (source) => {
				const [prompts, skills] = await Promise.all([
					discoverPromptsFromSource(source),
					discoverSkillsFromSource(source),
				]);
				return [...prompts, ...skills];
			}),
		)
	).flat();

	const discoveredPrompts = uniqueAssets(discovered.filter((asset) => asset.kind === "prompt"));
	const discoveredSkills = uniqueAssets(discovered.filter((asset) => asset.kind === "skill"));

	const unsyncedPrompts = discoveredPrompts.filter(
		(asset) => asset.kind === "prompt" && !homePrompts.has(asset.id),
	);
	const unsyncedSkills = discoveredSkills.filter(
		(asset) => asset.kind === "skill" && !homeSkills.has(asset.id),
	);

	return {
		home: options.home,
		scannedSources: options.sources.map((s) => s.root),
		discoveredPrompts,
		discoveredSkills,
		unsyncedPrompts: uniqueAssets(unsyncedPrompts),
		unsyncedSkills: uniqueAssets(unsyncedSkills),
	};
}

export async function listGitTrackedFiles(repoRoot: string): Promise<Set<string>> {
	if (!(await isDirectory(path.join(repoRoot, ".git")))) {
		return new Set();
	}

	try {
		const { stdout } = await execFileAsync("git", ["-C", repoRoot, "ls-files"], {
			encoding: "utf8",
		});
		return new Set(
			stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => line.replaceAll("\\", "/")),
		);
	} catch {
		return new Set();
	}
}

export async function importDiscoveredAssetToHome(options: {
	home: string;
	asset: DiscoveredAsset;
	force?: boolean;
}): Promise<string> {
	if (options.asset.kind === "prompt") {
		const target = path.join(options.home, "prompts", `${options.asset.id}.md`);
		await copyFile(target, options.asset.path, Boolean(options.force));
		return target;
	}
	const target = path.join(options.home, "skills", options.asset.id);
	await copyDirectory(target, options.asset.path, Boolean(options.force));
	return target;
}

async function discoverPromptsFromSource(source: ScanSource): Promise<DiscoveredAsset[]> {
	const prompts: DiscoveredAsset[] = [];
	const roots = await resolveSourcePromptRoots(source.root, Boolean(source.explicit));
	for (const root of roots) {
		const files = await listMarkdownFiles(root);
		for (const file of files) {
			const rel = toPosix(path.relative(root, file));
			prompts.push({
				id: stripMarkdownExt(rel),
				kind: "prompt",
				source: source.name,
				path: file,
			});
		}
	}
	return prompts;
}

async function discoverSkillsFromSource(source: ScanSource): Promise<DiscoveredAsset[]> {
	const skills: DiscoveredAsset[] = [];
	const roots = await resolveSourceSkillRoots(source.root, Boolean(source.explicit));
	for (const root of roots) {
		const directories = await discoverSkillDirectories(root);
		for (const dir of directories) {
			const rel = toPosix(path.relative(root, dir));
			skills.push({
				id: rel,
				kind: "skill",
				source: source.name,
				path: dir,
			});
		}
	}
	return skills;
}

async function resolveSourcePromptRoots(sourceRoot: string, explicit: boolean): Promise<string[]> {
	const candidates = explicit ? ["", ...PROMPT_SOURCE_DIRS] : [...PROMPT_SOURCE_DIRS];
	const roots = await resolveExistingDirectories(sourceRoot, candidates);
	return uniqueStrings(roots);
}

async function resolveSourceSkillRoots(sourceRoot: string, explicit: boolean): Promise<string[]> {
	const candidates = explicit ? ["", ...SKILL_SOURCE_DIRS] : [...SKILL_SOURCE_DIRS];
	const roots = await resolveExistingDirectories(sourceRoot, candidates);
	return uniqueStrings(roots);
}

async function resolveExistingDirectories(
	base: string,
	subdirs: readonly string[],
): Promise<string[]> {
	const resolved: string[] = [];
	for (const subdir of subdirs) {
		const candidate = subdir ? path.join(base, subdir) : base;
		if (await isDirectory(candidate)) {
			resolved.push(path.resolve(candidate));
		}
	}
	return resolved;
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	if (!(await isDirectory(dir))) {
		return files;
	}
	await walkDirectory(dir, async (entryPath, entry) => {
		if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			files.push(entryPath);
		}
	});
	return files;
}

async function discoverSkillDirectories(dir: string): Promise<string[]> {
	const found: string[] = [];
	if (!(await isDirectory(dir))) {
		return found;
	}

	await walkDirectory(dir, async (entryPath, entry) => {
		if (!entry.isDirectory()) {
			return;
		}
		const skillMd = path.join(entryPath, "SKILL.md");
		const skillMdLower = path.join(entryPath, "skill.md");
		if ((await isFile(skillMd)) || (await isFile(skillMdLower))) {
			found.push(entryPath);
		}
	});

	return found;
}

async function walkDirectory(
	root: string,
	callback: (entryPath: string, entry: Dirent) => Promise<void>,
): Promise<void> {
	const queue = [root];
	while (queue.length) {
		const current = queue.shift();
		if (!current) {
			continue;
		}
		let entries: Dirent[];
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const entryPath = path.join(current, entry.name);
			if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
				continue;
			}
			await callback(entryPath, entry);
			if (entry.isDirectory()) {
				queue.push(entryPath);
			}
		}
	}
}

async function copyDirectory(target: string, source: string, force: boolean): Promise<void> {
	const targetExists = await pathExists(target);
	if (targetExists && !force) {
		throw new Error(`Target already exists: ${target}. Use --force to overwrite.`);
	}
	if (targetExists) {
		await fs.rm(target, { recursive: true, force: true });
	}
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.cp(source, target, { recursive: true, force: true });
}

async function copyFile(target: string, source: string, force: boolean): Promise<void> {
	const targetExists = await pathExists(target);
	if (targetExists && !force) {
		throw new Error(`Target already exists: ${target}. Use --force to overwrite.`);
	}
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.copyFile(source, target);
}

async function createSymlink(
	target: string,
	source: string,
	force: boolean,
	type: "file" | "dir",
): Promise<void> {
	const resolvedTarget = path.resolve(target);
	const resolvedSource = path.resolve(source);
	if (resolvedTarget === resolvedSource) {
		throw new Error(`Target already points to source: ${resolvedTarget}`);
	}

	const targetExists = await pathExists(resolvedTarget);
	if (targetExists && !force) {
		throw new Error(`Target already exists: ${resolvedTarget}. Use --force to overwrite.`);
	}
	if (targetExists) {
		await fs.rm(resolvedTarget, { recursive: true, force: true });
	}
	await fs.mkdir(path.dirname(resolvedTarget), { recursive: true });

	const relativeSource = path.relative(path.dirname(resolvedTarget), resolvedSource);
	const linkTarget = relativeSource && relativeSource.length > 0 ? relativeSource : resolvedSource;
	const linkType = process.platform === "win32" && type === "dir" ? "junction" : type;
	await fs.symlink(linkTarget, resolvedTarget, linkType);
}

async function assertPathExists(targetPath: string, message: string): Promise<void> {
	if (!(await pathExists(targetPath))) {
		throw new Error(`${message}: ${targetPath}`);
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

async function isDirectory(targetPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(targetPath);
		return stats.isDirectory();
	} catch {
		return false;
	}
}

async function isFile(targetPath: string): Promise<boolean> {
	try {
		const stats = await fs.stat(targetPath);
		return stats.isFile();
	} catch {
		return false;
	}
}

function stripMarkdownExt(filePath: string): string {
	return filePath.replace(/\.md$/i, "");
}

function toPosix(filePath: string): string {
	return filePath.split(path.sep).join("/");
}

function uniqueStrings(values: string[]): string[] {
	return [...new Set(values)];
}

function uniqueAssets(assets: DiscoveredAsset[]): DiscoveredAsset[] {
	const seen = new Set<string>();
	const output: DiscoveredAsset[] = [];
	for (const asset of assets) {
		const key = `${asset.kind}:${asset.id}:${asset.path}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		output.push(asset);
	}
	return output;
}
