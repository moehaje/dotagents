import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLinkCommand } from "../src/commands/link-command.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

beforeEach(async () => {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-link-project-"));
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

describe("runLinkCommand", () => {
	it("returns usage error for invalid agent flags", async () => {
		const code = await runLinkCommand(["prompt", "release", "-a", "invalid-agent"]);
		expect(code).toBe(2);
	});

	it("returns usage error for unknown options", async () => {
		const code = await runLinkCommand(["--unknown"]);
		expect(code).toBe(2);
	});

	it("links prompt and skill assets to project targets", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-link-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "terminal-ui"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: release\n---\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(home, "skills", "terminal-ui", "SKILL.md"),
			"---\nname: terminal-ui\ndescription: x\n---\n",
			"utf8",
		);

		const promptCode = await runLinkCommand(["prompt", "release", "--home", home]);
		const skillCode = await runLinkCommand(["skill", "terminal-ui", "--home", home]);
		expect(promptCode).toBe(0);
		expect(skillCode).toBe(0);

		const promptTarget = path.join(process.cwd(), ".agents", "prompts", "release.md");
		const skillTarget = path.join(process.cwd(), ".agents", "skills", "terminal-ui");
		expect((await fs.lstat(promptTarget)).isSymbolicLink()).toBe(true);
		expect((await fs.lstat(skillTarget)).isSymbolicLink()).toBe(true);
	});

	it("supports --all with omitted name", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-link-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "a.md"), "---\ndescription: x\n---\n", "utf8");
		await fs.writeFile(path.join(home, "prompts", "b.md"), "---\ndescription: x\n---\n", "utf8");

		const code = await runLinkCommand(["prompt", "--home", home, "--all"]);
		expect(code).toBe(0);
		expect(
			(await fs.lstat(path.join(process.cwd(), ".agents", "prompts", "a.md"))).isSymbolicLink(),
		).toBe(true);
		expect(
			(await fs.lstat(path.join(process.cwd(), ".agents", "prompts", "b.md"))).isSymbolicLink(),
		).toBe(true);
	});
});
