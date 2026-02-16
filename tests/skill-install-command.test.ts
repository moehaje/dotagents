import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runSkillCommand } from "../src/commands/skill-command.js";
import { hashDirectory } from "../src/core/skills-cli.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();
const originalInitCwd = process.env.INIT_CWD;

beforeEach(async () => {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-skill-command-"));
	tempDirs.push(projectRoot);
	process.chdir(projectRoot);
});

afterEach(async () => {
	process.chdir(originalCwd);
	if (originalInitCwd === undefined) {
		delete process.env.INIT_CWD;
	} else {
		process.env.INIT_CWD = originalInitCwd;
	}
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("skill check-lock command", () => {
	it("returns 0 when installed skill matches lock integrity", async () => {
		const projectRoot = process.cwd();
		process.env.INIT_CWD = projectRoot;
		const skillDir = path.join(projectRoot, ".agents", "skills", "demo");
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Demo\n", "utf8");
		const hash = await hashDirectory(skillDir);

		const lockfile = path.join(projectRoot, "agents.lock.toml");
		await fs.writeFile(
			lockfile,
			`version = 1

[[skills]]
id = "demo"
source = "example/demo"
resolved = "example/demo"
integrity = "sha256:${hash}"
`,
			"utf8",
		);

		const exitCode = await runSkillCommand(["check-lock", "--lockfile", lockfile]);
		expect(exitCode).toBe(0);
	});

	it("fails install when lockfile exists but is invalid", async () => {
		const projectRoot = process.cwd();
		process.env.INIT_CWD = projectRoot;
		const manifest = path.join(projectRoot, "agents.toml");
		const lockfile = path.join(projectRoot, "agents.lock.toml");
		await fs.writeFile(
			manifest,
			`[[skills]]
id = "demo"
source = "example/demo"
`,
			"utf8",
		);
		await fs.writeFile(lockfile, `version = "not-a-number"\n`, "utf8");
		const exitCode = await runCli([
			"skill",
			"install",
			"--manifest",
			manifest,
			"--lockfile",
			lockfile,
		]);
		expect(exitCode).toBe(1);
		expect(await fs.readFile(lockfile, "utf8")).toContain(`version = "not-a-number"`);
	});
});
