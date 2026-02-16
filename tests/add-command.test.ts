import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAddCommand } from "../src/commands/add-command.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

beforeEach(async () => {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-add-project-"));
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

describe("runAddCommand", () => {
	it("copies assets by default", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-add-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: release\n---\n",
			"utf8",
		);

		const code = await runAddCommand(["prompt", "release", "--home", home]);
		expect(code).toBe(0);
		const target = path.join(process.cwd(), ".agents", "prompts", "release.md");
		expect((await fs.lstat(target)).isSymbolicLink()).toBe(false);
	});

	it("supports --mode symlink", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-add-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: release\n---\n",
			"utf8",
		);

		const code = await runAddCommand(["prompt", "release", "--home", home, "--mode", "symlink"]);
		expect(code).toBe(0);
		const target = path.join(process.cwd(), ".agents", "prompts", "release.md");
		expect((await fs.lstat(target)).isSymbolicLink()).toBe(true);
	});

	it("returns usage error for invalid mode", async () => {
		const code = await runAddCommand(["prompt", "release", "--mode", "invalid"]);
		expect(code).toBe(2);
	});
});
