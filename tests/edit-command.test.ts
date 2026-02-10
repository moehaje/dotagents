import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runEditCommand } from "../src/commands/edit-command.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("runEditCommand", () => {
	it("returns usage error for invalid agent flags", async () => {
		const code = await runEditCommand(["prompt", "release", "-a", "invalid-agent"]);
		expect(code).toBe(2);
	});

	it("returns usage error when --file is used with prompt", async () => {
		const code = await runEditCommand(["prompt", "release", "--file", "notes.md"]);
		expect(code).toBe(2);
	});

	it("returns usage error for non-interactive multi-target ambiguity", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-edit-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "release.md"), "test\n", "utf8");

		const code = await runEditCommand([
			"prompt",
			"release",
			"--home",
			home,
			"-p",
			"-g",
			"-a",
			"codex",
		]);
		expect(code).toBe(2);
	});

	it("opens editor successfully for existing file", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-edit-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "release.md"), "test\n", "utf8");

		const code = await runEditCommand(["prompt", "release", "--home", home, "--editor", "true"]);
		expect(code).toBe(0);
	});

	it("returns runtime failure if target file does not exist", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-edit-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });

		const code = await runEditCommand(["prompt", "missing", "--home", home, "--editor", "true"]);
		expect(code).toBe(1);
	});
});
