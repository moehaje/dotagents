import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInitCommand } from "../src/commands/init-command.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

beforeEach(async () => {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-init-project-"));
	tempDirs.push(projectRoot);
	process.chdir(projectRoot);
});

afterEach(async () => {
	process.chdir(originalCwd);
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("runInitCommand", () => {
	it("returns usage error for unknown options", async () => {
		const code = await runInitCommand(["--unknown"]);
		expect(code).toBe(2);
	});

	it("creates scaffold directories and files", async () => {
		const code = await runInitCommand(["-p"]);
		expect(code).toBe(0);

		await expect(pathExists(path.join(process.cwd(), ".agents", "prompts"))).resolves.toBe(true);
		await expect(pathExists(path.join(process.cwd(), ".agents", "skills"))).resolves.toBe(true);
		await expect(pathExists(path.join(process.cwd(), ".agents", "AGENTS.md"))).resolves.toBe(true);
		await expect(pathExists(path.join(process.cwd(), ".agents", "README.md"))).resolves.toBe(true);
	});

	it("preserves scaffold files without --force", async () => {
		await runInitCommand(["-p"]);
		const filePath = path.join(process.cwd(), ".agents", "AGENTS.md");
		await fs.writeFile(filePath, "custom-content\n", "utf8");

		const code = await runInitCommand(["-p"]);
		expect(code).toBe(0);
		await expect(fs.readFile(filePath, "utf8")).resolves.toBe("custom-content\n");
	});

	it("overwrites scaffold files with --force", async () => {
		await runInitCommand(["-p"]);
		const filePath = path.join(process.cwd(), ".agents", "AGENTS.md");
		await fs.writeFile(filePath, "custom-content\n", "utf8");

		const code = await runInitCommand(["-p", "--force"]);
		expect(code).toBe(0);
		const content = await fs.readFile(filePath, "utf8");
		expect(content).toContain(`# ${path.basename(process.cwd())}`);
	});

	it("installs selected prompt and skill assets with --with", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-init-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "terminal-ui"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: x\n---\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(home, "skills", "terminal-ui", "SKILL.md"),
			"---\nname: terminal-ui\ndescription: x\n---\n",
			"utf8",
		);

		const code = await runInitCommand([
			"-p",
			"--home",
			home,
			"--with",
			"prompt:release,skill:terminal-ui",
		]);
		expect(code).toBe(0);

		await expect(
			pathExists(path.join(process.cwd(), ".agents", "prompts", "release.md")),
		).resolves.toBe(true);
		await expect(
			pathExists(path.join(process.cwd(), ".agents", "skills", "terminal-ui")),
		).resolves.toBe(true);
	});

	it("creates symlink when --link is used with --with", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-init-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: x\n---\n",
			"utf8",
		);

		const code = await runInitCommand(["-p", "--home", home, "--with", "prompt:release", "--link"]);
		expect(code).toBe(0);

		const targetPath = path.join(process.cwd(), ".agents", "prompts", "release.md");
		const stats = await fs.lstat(targetPath);
		expect(stats.isSymbolicLink()).toBe(true);
	});

	it("returns usage error for malformed --with entries", async () => {
		const code = await runInitCommand(["-p", "--with", "release"]);
		expect(code).toBe(2);
	});
});

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
