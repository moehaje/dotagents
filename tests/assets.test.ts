import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanUnsyncedAssets, slugifyName } from "../src/core/assets.js";

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

describe("slugifyName", () => {
	it("normalizes mixed input into a stable slug", () => {
		expect(slugifyName(" Release Candidate 1.md ")).toBe("release-candidate-1");
		expect(slugifyName("My/Prompt Name")).toBe("my/prompt-name");
		expect(slugifyName("foo/../../bar")).toBe("foo/bar");
	});
});

describe("scanUnsyncedAssets", () => {
	it("detects prompt and skill drift from scan sources", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-test-"));
		tempDirs.push(root);

		const home = path.join(root, "home");
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "existing-skill"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "tracked.md"), "---\ndescription: x\n---\n");
		await fs.writeFile(
			path.join(home, "skills", "existing-skill", "SKILL.md"),
			"---\nname: existing-skill\ndescription: x\n---\n",
		);

		const codex = path.join(root, "codex");
		await fs.mkdir(path.join(codex, "prompts"), { recursive: true });
		await fs.mkdir(path.join(codex, "skills", "new-skill"), { recursive: true });
		await fs.writeFile(path.join(codex, "prompts", "tracked.md"), "---\ndescription: x\n---\n");
		await fs.writeFile(path.join(codex, "prompts", "new-prompt.md"), "---\ndescription: x\n---\n");
		await fs.writeFile(
			path.join(codex, "skills", "new-skill", "SKILL.md"),
			"---\nname: new-skill\ndescription: x\n---\n",
		);

		const report = await scanUnsyncedAssets({
			home,
			sources: [{ name: "codex", root: codex }],
		});

		expect(report.discoveredPrompts.map((item) => item.id)).toContain("tracked");
		expect(report.discoveredPrompts.map((item) => item.id)).toContain("new-prompt");
		expect(report.discoveredSkills.map((item) => item.id)).toContain("new-skill");
		expect(report.unsyncedPrompts.map((item) => item.id)).toContain("new-prompt");
		expect(report.unsyncedPrompts.map((item) => item.id)).not.toContain("tracked");
		expect(report.unsyncedSkills.map((item) => item.id)).toContain("new-skill");
		expect(report.unsyncedSkills.map((item) => item.id)).not.toContain("existing-skill");
	});
});
