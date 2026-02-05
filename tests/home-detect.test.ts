import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findDirectoriesByName } from "../src/core/config.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("findDirectoriesByName", () => {
	it("finds dotagents and dot-agents directories within depth", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-find-"));
		tempDirs.push(root);

		const a = path.join(root, "sync", "dev", "dotagents");
		const b = path.join(root, "projects", "x", "dot-agents");
		await fs.mkdir(a, { recursive: true });
		await fs.mkdir(b, { recursive: true });

		const matches = await findDirectoriesByName(
			[root],
			new Set(["dotagents", "dot-agents"]),
			4,
		);
		expect(matches).toContain(a);
		expect(matches).toContain(b);
	});
});
