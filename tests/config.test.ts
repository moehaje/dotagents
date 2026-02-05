import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildDefaultConfig,
	getGlobalConfigPath,
	loadGlobalConfig,
	saveGlobalConfig,
} from "../src/core/config.js";

const originalXdg = process.env.XDG_CONFIG_HOME;

describe("global config persistence", () => {
	beforeEach(async () => {
		const temp = await fs.mkdtemp(path.join(process.cwd(), ".tmp-config-"));
		process.env.XDG_CONFIG_HOME = temp;
	});

	afterEach(async () => {
		const xdg = process.env.XDG_CONFIG_HOME;
		if (xdg) {
			await fs.rm(xdg, { recursive: true, force: true });
		}
		process.env.XDG_CONFIG_HOME = originalXdg;
	});

	it("saves and loads config", async () => {
		const config = buildDefaultConfig("~/dotagents");
		await saveGlobalConfig(config);
		const loaded = await loadGlobalConfig();
		expect(loaded?.homeRepo).toBe(config.homeRepo);
		expect(loaded?.agents.codex).toBe(config.agents.codex);
		expect(getGlobalConfigPath().includes("dotagents/config.json")).toBe(true);
	});
});
