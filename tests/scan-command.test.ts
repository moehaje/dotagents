import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runScanCommand } from "../src/commands/scan-command.js";

const tempDirs: string[] = [];
const originalCwd = process.cwd();

beforeEach(async () => {
	const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-scan-project-"));
	tempDirs.push(projectRoot);
	process.chdir(projectRoot);
});

afterEach(async () => {
	process.chdir(originalCwd);
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("runScanCommand", () => {
	it("includes conflicts in --json output with --diff", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-scan-home-"));
		const source = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-scan-source-"));
		tempDirs.push(home, source);

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

		const writes: string[] = [];
		const originalWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
			return true;
		}) as typeof process.stdout.write;

		try {
			const exitCode = await runScanCommand([
				"--home",
				home,
				"--source",
				source,
				"--json",
				"--diff",
			]);
			expect(exitCode === 0 || exitCode === 1).toBe(true);
		} finally {
			process.stdout.write = originalWrite;
		}

		const output = writes.join("");
		const parsed = JSON.parse(output) as {
			conflicts?: Array<{ id?: string; state?: string }>;
		};
		expect(parsed.conflicts).toBeDefined();
		expect(
			parsed.conflicts?.some(
				(conflict) =>
					conflict.id === "release" && conflict.state && conflict.state !== "no-conflict",
			),
		).toBe(true);
	});
});
