import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCheckCommand } from "../src/commands/check-command.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) {
			continue;
		}
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("runCheckCommand", () => {
	it("returns usage error for unknown options", async () => {
		const code = await runCheckCommand(["--unknown"]);
		expect(code).toBe(2);
	});

	it("returns success for valid assets", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-command-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "terminal-ui"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: Release checklist\n---\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(home, "skills", "terminal-ui", "SKILL.md"),
			"---\nname: terminal-ui\ndescription: Build terminal interfaces\n---\n",
			"utf8",
		);

		const code = await runCheckCommand(["--home", home]);
		expect(code).toBe(0);
	});

	it("returns failure when errors are found", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-command-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "bad.md"), "# missing frontmatter\n", "utf8");

		const code = await runCheckCommand(["--home", home]);
		expect(code).toBe(1);
	});

	it("returns failure with --strict when warnings are present", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-command-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "skills", "terminal-ui"), { recursive: true });
		await fs.writeFile(
			path.join(home, "skills", "terminal-ui", "SKILL.md"),
			"---\nname: terminal\ndescription: Build terminal interfaces\n---\n",
			"utf8",
		);

		const warningOnlyCode = await runCheckCommand(["--home", home]);
		const strictCode = await runCheckCommand(["--home", home, "--strict"]);
		expect(warningOnlyCode).toBe(0);
		expect(strictCode).toBe(1);
	});

	it("honors kind filters for exit-code behavior", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-command-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "terminal-ui"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "bad.md"), "# missing frontmatter\n", "utf8");
		await fs.writeFile(
			path.join(home, "skills", "terminal-ui", "SKILL.md"),
			"---\nname: terminal-ui\ndescription: Build terminal interfaces\n---\n",
			"utf8",
		);

		const skillCode = await runCheckCommand(["skill", "--home", home]);
		const promptCode = await runCheckCommand(["prompt", "--home", home, "--json"]);
		expect(skillCode).toBe(0);
		expect(promptCode).toBe(1);
	});

	it("supports --filter to check exact asset names", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-command-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts", "nested"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "nested", "axiom.md"),
			"---\ndescription: Valid axiom\n---\n",
			"utf8",
		);
		await fs.writeFile(path.join(home, "prompts", "legacy.md"), "# missing frontmatter\n", "utf8");

		const code = await runCheckCommand(["--home", home, "--filter", "axiom"]);
		expect(code).toBe(0);
	});

	it("supports --exclude to skip exact asset names", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-command-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "axiom.md"), "# missing frontmatter\n", "utf8");
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: Valid release\n---\n",
			"utf8",
		);

		const code = await runCheckCommand(["--home", home, "--exclude", "axiom"]);
		expect(code).toBe(0);
	});
});
