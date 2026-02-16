import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	loadAgentsLock,
	parseAgentsLock,
	parseAgentsManifest,
	serializeAgentsLock,
	writeAgentsLock,
} from "../src/core/agents-manifest.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("agents manifest parser", () => {
	it("parses manifest with project and skills", () => {
		const parsed = parseAgentsManifest(`
[project]
name = "demo"

[[skills]]
id = "find-skills"
source = "vercel-labs/skills@find-skills"
`);
		expect(parsed.project?.name).toBe("demo");
		expect(parsed.skills).toEqual([
			{ id: "find-skills", source: "vercel-labs/skills@find-skills" },
		]);
	});

	it("rejects duplicate skill ids", () => {
		expect(() =>
			parseAgentsManifest(`
[[skills]]
id = "find-skills"
source = "a"

[[skills]]
id = "find-skills"
source = "b"
`),
		).toThrow(/duplicate skill id/i);
	});
});

describe("agents lock parser/serializer", () => {
	it("serializes deterministically sorted by id", () => {
		const text = serializeAgentsLock({
			version: 1,
			skills: [
				{ id: "z", source: "s2", resolved: "r2", integrity: "sha256:bbb" },
				{ id: "a", source: "s1", resolved: "r1", integrity: "sha256:aaa" },
			],
		});
		expect(text.indexOf('id = "a"')).toBeLessThan(text.indexOf('id = "z"'));
		const parsed = parseAgentsLock(text);
		expect(parsed.skills.map((item) => item.id)).toEqual(["a", "z"]);
	});

	it("writes and reloads lockfile", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-lock-"));
		tempDirs.push(root);
		const lockfile = path.join(root, "agents.lock.toml");
		await writeAgentsLock(lockfile, {
			version: 1,
			skills: [{ id: "a", source: "s1", resolved: "r1", integrity: "sha256:aaa" }],
		});
		const loaded = await loadAgentsLock(lockfile);
		expect(loaded.version).toBe(1);
		expect(loaded.skills).toHaveLength(1);
	});
});
