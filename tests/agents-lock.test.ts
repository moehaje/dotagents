import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	checkInstalledSkillsAgainstLock,
	installSkillsFromLock,
} from "../src/core/agents-manifest.js";
import { hashDirectory } from "../src/core/skills-cli.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("agents lock install/check", () => {
	it("installs skills from lock with staged source and passes check-lock", async () => {
		const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-lock-install-"));
		const stagedSkillRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-stage-skill-"));
		tempDirs.push(projectRoot, stagedSkillRoot);

		await fs.writeFile(path.join(stagedSkillRoot, "SKILL.md"), "# Demo\n", "utf8");
		const stagedHash = await hashDirectory(stagedSkillRoot);
		const lock = {
			version: 1 as const,
			skills: [
				{
					id: "demo-skill",
					source: "example/demo",
					resolved: "example/demo",
					integrity: `sha256:${stagedHash}`,
				},
			],
		};

		const results = await installSkillsFromLock(lock, {
			projectRoot,
			stageSkill: async () => {
				const cloneRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-stage-clone-"));
				tempDirs.push(cloneRoot);
				const cloneDir = path.join(cloneRoot, "skill");
				await fs.cp(stagedSkillRoot, cloneDir, { recursive: true, force: true });
				return { success: true, skillDir: cloneDir, hash: stagedHash };
			},
		});
		expect(results[0]?.installed).toBe(true);

		const checks = await checkInstalledSkillsAgainstLock(lock, { projectRoot });
		expect(checks).toEqual([{ id: "demo-skill", status: "ok" }]);
	});

	it("reports mismatch when local skill content differs from lock", async () => {
		const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-lock-mismatch-"));
		const skillDir = path.join(projectRoot, ".agents", "skills", "demo");
		tempDirs.push(projectRoot);
		await fs.mkdir(skillDir, { recursive: true });
		await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Local\n", "utf8");

		const checks = await checkInstalledSkillsAgainstLock(
			{
				version: 1,
				skills: [
					{
						id: "demo",
						source: "example/demo",
						resolved: "example/demo",
						integrity: "sha256:deadbeef",
					},
				],
			},
			{ projectRoot },
		);
		expect(checks[0]?.status).toBe("mismatch");
	});
});
