import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	resolveCreateEditTargetsWithRoots,
	validateSkillFileHelperPath,
} from "../src/core/target-resolution.js";

describe("resolveCreateEditTargetsWithRoots", () => {
	it("defaults to home scope when no explicit target flags are provided", () => {
		const targets = resolveCreateEditTargetsWithRoots({
			kind: "prompt",
			assetId: "release",
			home: "/tmp/home",
			options: { agents: [] },
			globalRoots: [],
			cwd: "/repo",
		});
		expect(targets).toEqual([
			{
				id: "home",
				label: "Home",
				path: path.resolve("/tmp/home/prompts/release.md"),
			},
		]);
	});

	it("resolves project targets for selected agents", () => {
		const targets = resolveCreateEditTargetsWithRoots({
			kind: "skill",
			assetId: "terminal-ui",
			home: "/tmp/home",
			options: { project: true, agents: ["codex", "claude"] },
			globalRoots: [],
			cwd: "/repo",
		});
		expect(targets.map((item) => item.path)).toEqual([
			path.resolve("/repo/.codex/skills/terminal-ui/SKILL.md"),
			path.resolve("/repo/.claude/skills/terminal-ui/SKILL.md"),
		]);
	});

	it("uses global roots for -g and -a", () => {
		const targets = resolveCreateEditTargetsWithRoots({
			kind: "prompt",
			assetId: "release",
			home: "/tmp/home",
			options: { global: true, agents: ["codex"] },
			globalRoots: [
				{ id: "codex", label: "codex", root: "/users/me/.codex" },
				{ id: "claude", label: "claude", root: "/users/me/.claude" },
			],
			cwd: "/repo",
		});
		expect(targets).toEqual([
			{
				id: "global-codex",
				label: "Global: codex",
				path: path.resolve("/users/me/.codex/prompts/release.md"),
			},
		]);
	});

	it("treats agent-only selection as global-agent target", () => {
		const targets = resolveCreateEditTargetsWithRoots({
			kind: "skill",
			assetId: "terminal-ui",
			home: "/tmp/home",
			options: { agents: ["agents"] },
			globalRoots: [{ id: "agents", label: "agents", root: "/users/me/.agents" }],
			cwd: "/repo",
		});
		expect(targets).toEqual([
			{
				id: "agent-agents",
				label: "Agent: agents",
				path: path.resolve("/users/me/.agents/skills/terminal-ui/SKILL.md"),
			},
		]);
	});
});

describe("validateSkillFileHelperPath", () => {
	it("accepts relative nested paths", () => {
		expect(validateSkillFileHelperPath("references/guide.md")).toEqual({
			valid: true,
			normalizedPath: "references/guide.md",
		});
	});

	it("rejects absolute and traversal paths", () => {
		expect(validateSkillFileHelperPath("/tmp/file.md")).toEqual({
			valid: false,
			reason: "Skill file path must be relative.",
		});
		expect(validateSkillFileHelperPath("../escape.md")).toEqual({
			valid: false,
			reason: "Skill file path cannot include '..' traversal.",
		});
	});
});
