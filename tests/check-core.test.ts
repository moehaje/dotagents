import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAssetChecks } from "../src/core/check.js";

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

describe("runAssetChecks", () => {
	it("passes when prompt and skill assets are valid", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-core-"));
		tempDirs.push(home);

		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "terminal-ui"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: Release checklist\n---\n\n# Release\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(home, "skills", "terminal-ui", "SKILL.md"),
			"---\nname: terminal-ui\ndescription: Build terminal interfaces\n---\n",
			"utf8",
		);

		const summary = await runAssetChecks({ home });
		expect(summary.valid).toBe(true);
		expect(summary.errorCount).toBe(0);
		expect(summary.warningCount).toBe(0);
		expect(summary.prompts.checked).toBe(1);
		expect(summary.skills.checked).toBe(1);
	});

	it("reports prompt and skill issues with severity counts", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-core-"));
		tempDirs.push(home);

		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "broken"), { recursive: true });
		await fs.mkdir(path.join(home, "skills", "mismatch"), { recursive: true });
		await fs.writeFile(path.join(home, "prompts", "bad.md"), "# Missing frontmatter\n", "utf8");
		await fs.writeFile(
			path.join(home, "skills", "mismatch", "SKILL.md"),
			"---\nname: another-skill\ndescription: mismatch warning\n---\n",
			"utf8",
		);

		const summary = await runAssetChecks({ home });
		const codes = [...summary.prompts.results, ...summary.skills.results]
			.flatMap((result) => result.issues)
			.map((issue) => issue.code);

		expect(summary.valid).toBe(false);
		expect(summary.errorCount).toBeGreaterThanOrEqual(2);
		expect(summary.warningCount).toBeGreaterThanOrEqual(1);
		expect(codes).toContain("prompt.frontmatter.missing");
		expect(codes).toContain("skill.file.missing");
		expect(codes).toContain("skill.name.mismatch");
	});

	it("supports kind filtering", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-check-core-"));
		tempDirs.push(home);

		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: Release checklist\n---\n",
			"utf8",
		);

		const skillOnly = await runAssetChecks({ home, kindFilter: "skill" });
		expect(skillOnly.prompts.checked).toBe(0);
		expect(skillOnly.skills.checked).toBe(0);
		expect(skillOnly.errorCount).toBe(0);
	});
});
