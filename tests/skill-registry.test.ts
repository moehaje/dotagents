import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSkillRegistry } from "../src/core/skill-registry.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("readSkillRegistry", () => {
	it("parses registry entries and skips comments", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-registry-"));
		tempDirs.push(root);
		const home = path.join(root, "home");
		await fs.mkdir(path.join(home, "configs"), { recursive: true });
		await fs.writeFile(
			path.join(home, "configs", "skills-registry.tsv"),
			[
				"# skill-path<TAB>source-spec",
				"terminal-ui\tvercel-labs/skills@terminal-ui",
				"",
				"ios/xcodebuildmcp\tvercel-labs/skills@xcodebuildmcp",
			].join("\n"),
			"utf8",
		);

		const entries = await readSkillRegistry(home);
		expect(entries).toEqual([
			{ skillPath: "terminal-ui", sourceSpec: "vercel-labs/skills@terminal-ui" },
			{ skillPath: "ios/xcodebuildmcp", sourceSpec: "vercel-labs/skills@xcodebuildmcp" },
		]);
	});
});
