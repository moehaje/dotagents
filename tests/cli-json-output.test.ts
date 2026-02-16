import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

const tempDirs: string[] = [];

afterEach(async () => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		if (!dir) continue;
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("runCli json output", () => {
	it("does not print banner noise before json payload", async () => {
		const home = await fs.mkdtemp(path.join(os.tmpdir(), "dotagents-cli-json-home-"));
		tempDirs.push(home);
		await fs.mkdir(path.join(home, "prompts"), { recursive: true });
		await fs.mkdir(path.join(home, "skills"), { recursive: true });

		const writes: string[] = [];
		const originalWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = ((chunk: string | Uint8Array) => {
			writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
			return true;
		}) as typeof process.stdout.write;

		try {
			const exitCode = await runCli(["check", "--home", home, "--json"]);
			expect(exitCode).toBe(0);
		} finally {
			process.stdout.write = originalWrite;
		}

		const output = writes.join("");
		expect(output.trimStart().startsWith("{")).toBe(true);
		expect(() => JSON.parse(output)).not.toThrow();
	});
});
