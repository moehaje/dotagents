import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildBuiltInScanSources,
	buildDefaultConfig,
	defaultScanSources,
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
		config.editor = "code --wait";
		await saveGlobalConfig(config);
		const loaded = await loadGlobalConfig();
		expect(loaded?.homeRepo).toBe(config.homeRepo);
		expect(loaded?.editor).toBe(config.editor);
		expect(loaded?.agents.codex).toBe(config.agents.codex);
		expect(getGlobalConfigPath().includes("dotagents/config.json")).toBe(true);
	});

	it("includes additional built-in agent scan sources from skills ecosystem", async () => {
		const base = {
			home: "/tmp/home",
			configHome: "/tmp/config",
			codexHome: "/tmp/home/.codex",
			claudeHome: "/tmp/home/.claude",
			agentsHome: "/tmp/home/.agents",
		};

		const builtIns = buildBuiltInScanSources(base);
		const names = builtIns.map((item) => item.name);
		expect(names).toContain("cursor");
		expect(names).toContain("windsurf");
		expect(names).toContain("opencode");
		expect(names).toContain("goose");
		expect(names).toContain("amp");
		expect(builtIns.find((item) => item.name === "windsurf")?.root).toBe(
			"/tmp/home/.codeium/windsurf",
		);
		expect(builtIns.find((item) => item.name === "opencode")?.root).toBe("/tmp/config/opencode");
	});

	it("default scan sources dedupe overlapping built-ins", async () => {
		const sources = await defaultScanSources();
		const roots = sources.map((source) => source.root);
		expect(new Set(roots).size).toBe(roots.length);
	});
});
