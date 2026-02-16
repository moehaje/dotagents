import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildScanConflicts } from "../src/core/scan-conflicts.js";
import type { DiscoveredAsset } from "../src/core/types.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("buildScanConflicts", () => {
	it("detects content drift between source and home prompt", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-scan-conflicts-"));
		tempDirs.push(root);
		const home = path.join(root, "home");
		const source = path.join(root, "source");
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(source, "prompts"), { recursive: true });
		await fs.writeFile(
			path.join(home, "prompts", "release.md"),
			"---\ndescription: home\n---\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(source, "prompts", "release.md"),
			"---\ndescription: source\n---\n",
			"utf8",
		);

		const assets: DiscoveredAsset[] = [
			{
				kind: "prompt",
				id: "release",
				source: "custom",
				path: path.join(source, "prompts", "release.md"),
			},
		];
		const tracked = new Set<string>(["prompts/release.md"]);
		const conflicts = await buildScanConflicts({
			home,
			discoveredAssets: assets,
			trackedFiles: tracked,
			includeDiff: true,
		});
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.state).toBe("content-drift");
		expect(conflicts[0]?.diff?.summary).toContain("home");
	});

	it("detects ambiguous multi-source conflicts for same id", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-scan-conflicts-"));
		tempDirs.push(root);
		const home = path.join(root, "home");
		const sourceA = path.join(root, "source-a");
		const sourceB = path.join(root, "source-b");
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(sourceA, "prompts"), { recursive: true });
		await fs.mkdir(path.join(sourceB, "prompts"), { recursive: true });
		await fs.writeFile(
			path.join(sourceA, "prompts", "release.md"),
			"---\ndescription: a\n---\n",
			"utf8",
		);
		await fs.writeFile(
			path.join(sourceB, "prompts", "release.md"),
			"---\ndescription: b\n---\n",
			"utf8",
		);

		const assets: DiscoveredAsset[] = [
			{
				kind: "prompt",
				id: "release",
				source: "a",
				path: path.join(sourceA, "prompts", "release.md"),
			},
			{
				kind: "prompt",
				id: "release",
				source: "b",
				path: path.join(sourceB, "prompts", "release.md"),
			},
		];
		const conflicts = await buildScanConflicts({
			home,
			discoveredAssets: assets,
			trackedFiles: new Set<string>(),
			includeDiff: true,
		});
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0]?.state).toBe("ambiguous-multi-source");
	});
});
