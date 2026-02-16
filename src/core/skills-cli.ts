import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function stageSkillSource(
	sourceSpec: string,
	options?: { tempPrefix?: string },
): Promise<{ success: boolean; skillDir?: string; hash?: string; message?: string }> {
	const tempRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), options?.tempPrefix ?? "dotagents-skill-"),
	);
	try {
		const code = await runSkillsAdd(sourceSpec, tempRoot, "ignore");
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
		const skillDir = path.join(stagedRoot, firstSkill.name);
		const hash = await hashDirectory(skillDir);
		return { success: true, skillDir: await cloneStagedSkill(skillDir), hash };
	} finally {
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
}

export async function runSkillsAdd(
	sourceSpec: string,
	cwd: string,
	stdio: "inherit" | "ignore",
): Promise<number> {
	const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
	const child = spawn(npxCmd, ["skills", "add", sourceSpec, "-y"], {
		cwd,
		stdio,
		shell: false,
	});
	return await new Promise<number>((resolve) => {
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
}

export async function hashDirectory(targetDir: string): Promise<string> {
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

async function cloneStagedSkill(skillDir: string): Promise<string> {
	const cloneRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-staged-skill-"));
	await fs.cp(skillDir, cloneRoot, { recursive: true, force: true });
	return cloneRoot;
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
