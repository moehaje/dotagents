import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export type SkillRegistryEntry = {
	skillPath: string;
	sourceSpec: string;
};

export type SkillRegistryStatus = {
	entry: SkillRegistryEntry;
	status: "up-to-date" | "outdated" | "missing-local" | "missing-remote" | "error";
	message?: string;
};

export async function readSkillRegistry(homeRepo: string): Promise<SkillRegistryEntry[]> {
	const registryPath = path.join(homeRepo, "configs", "skills-registry.tsv");
	try {
		const raw = await fs.readFile(registryPath, "utf8");
		const entries: SkillRegistryEntry[] = [];
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}
			const [skillPath, sourceSpec] = trimmed.split("\t");
			if (!skillPath || !sourceSpec) {
				continue;
			}
			entries.push({ skillPath, sourceSpec });
		}
		return entries;
	} catch {
		return [];
	}
}

export async function checkRegistryStatus(homeRepo: string): Promise<SkillRegistryStatus[]> {
	const entries = await readSkillRegistry(homeRepo);
	const statuses: SkillRegistryStatus[] = [];

	for (const entry of entries) {
		const localDir = path.join(homeRepo, "skills", entry.skillPath);
		if (!(await pathExists(localDir))) {
			statuses.push({ entry, status: "missing-local" });
			continue;
		}

		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-skill-check-"));
		try {
			const stageResult = await stageSkill(entry.sourceSpec, tempRoot);
			if (!stageResult.success || !stageResult.skillDir) {
				statuses.push({
					entry,
					status: "error",
					message: stageResult.message ?? "Could not stage remote skill.",
				});
				continue;
			}

			const localHash = await hashDirectory(localDir);
			const remoteHash = await hashDirectory(stageResult.skillDir);
			if (localHash === remoteHash) {
				statuses.push({ entry, status: "up-to-date" });
			} else {
				statuses.push({ entry, status: "outdated" });
			}
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}

	return statuses;
}

export async function applyRegistryUpdates(
	homeRepo: string,
	targetEntries: SkillRegistryEntry[],
): Promise<Array<{ entry: SkillRegistryEntry; updated: boolean; message?: string }>> {
	const results: Array<{ entry: SkillRegistryEntry; updated: boolean; message?: string }> = [];
	for (const entry of targetEntries) {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-skill-update-"));
		try {
			const stageResult = await stageSkill(entry.sourceSpec, tempRoot);
			if (!stageResult.success || !stageResult.skillDir) {
				results.push({
					entry,
					updated: false,
					message: stageResult.message ?? "Could not stage remote skill.",
				});
				continue;
			}

			const targetDir = path.join(homeRepo, "skills", entry.skillPath);
			await fs.mkdir(path.dirname(targetDir), { recursive: true });
			await fs.rm(targetDir, { recursive: true, force: true });
			await fs.cp(stageResult.skillDir, targetDir, { recursive: true, force: true });
			results.push({ entry, updated: true });
		} finally {
			await fs.rm(tempRoot, { recursive: true, force: true });
		}
	}
	return results;
}

async function stageSkill(
	sourceSpec: string,
	tempRoot: string,
): Promise<{ success: boolean; skillDir?: string; message?: string }> {
	const code = await runSkillsAdd(sourceSpec, tempRoot);
	if (code !== 0) {
		return { success: false, message: `npx skills add failed for ${sourceSpec}` };
	}

	const stagedRoot = path.join(tempRoot, ".agents", "skills");
	if (!(await pathExists(stagedRoot))) {
		return { success: false, message: "No staged skill directory produced." };
	}
	const dirs = await fs.readdir(stagedRoot, { withFileTypes: true });
	const firstSkill = dirs.find((dirent) => dirent.isDirectory());
	if (!firstSkill) {
		return { success: false, message: "No staged skills were found." };
	}
	return { success: true, skillDir: path.join(stagedRoot, firstSkill.name) };
}

async function runSkillsAdd(sourceSpec: string, cwd: string): Promise<number> {
	const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
	const child = spawn(npxCmd, ["skills", "add", sourceSpec, "-y"], {
		cwd,
		stdio: "ignore",
		shell: false,
	});
	return await new Promise<number>((resolve) => {
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
}

async function hashDirectory(targetDir: string): Promise<string> {
	const hasher = createHash("sha256");
	const files = await collectFiles(targetDir);
	for (const file of files) {
		const rel = path.relative(targetDir, file).split(path.sep).join("/");
		hasher.update(rel);
		hasher.update("\n");
		const buf = await fs.readFile(file);
		hasher.update(buf);
		hasher.update("\n");
	}
	return hasher.digest("hex");
}

async function collectFiles(dir: string): Promise<string[]> {
	const output: string[] = [];
	const entries = await fs.readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			output.push(...(await collectFiles(entryPath)));
		} else if (entry.isFile()) {
			output.push(entryPath);
		}
	}
	return output.sort();
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
