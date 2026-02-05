import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
	buildDefaultConfig,
	expandTilde,
	getGlobalConfigPath,
	loadGlobalConfig,
	resolveHomeRepository,
	saveGlobalConfig,
	type DotagentsGlobalConfig,
} from "./config.js";

export async function ensureConfiguredForRun(): Promise<DotagentsGlobalConfig> {
	const existing = await loadGlobalConfig();
	if (existing) {
		return existing;
	}

	const isInteractive = Boolean(process.stdout.isTTY && process.stdin.isTTY);
	if (!isInteractive) {
		const homeRepo = await resolveHomeRepository();
		const config = buildDefaultConfig(homeRepo);
		await initializeHomeRepository(homeRepo, false);
		await saveGlobalConfig(config);
		return config;
	}

	return await runFirstRunSetup();
}

export async function runFirstRunSetup(): Promise<DotagentsGlobalConfig> {
	p.intro(pc.cyan("Welcome to dotagents"));
	p.log.info(`No global config found at ${getGlobalConfigPath()}.`);

	const hasExisting = await p.confirm({
		message: "Do you already have an agents home repository?",
		initialValue: true,
	});
	if (p.isCancel(hasExisting)) {
		throw new Error("Canceled first-run setup.");
	}

	let homeRepo: string;
	if (hasExisting) {
		const defaultHome = await resolveHomeRepository();
		const value = await p.text({
			message: "Path to your existing home repo",
			initialValue: defaultHome,
			validate(input) {
				if (!input.trim()) {
					return "Path is required.";
				}
				return undefined;
			},
		});
		if (p.isCancel(value)) {
			throw new Error("Canceled first-run setup.");
		}
		homeRepo = expandTilde(value);
		await initializeHomeRepository(homeRepo, false);
	} else {
		const value = await p.text({
			message: "Path for the new home repo",
			initialValue: path.join(process.env.HOME ?? "~", "dotagents"),
			validate(input) {
				if (!input.trim()) {
					return "Path is required.";
				}
				return undefined;
			},
		});
		if (p.isCancel(value)) {
			throw new Error("Canceled first-run setup.");
		}
		homeRepo = expandTilde(value);
		await initializeHomeRepository(homeRepo, true);
	}

	const defaults = buildDefaultConfig(homeRepo);
	const codexPath = await promptPath("Codex home path", defaults.agents.codex);
	const claudePath = await promptPath("Claude home path", defaults.agents.claude);
	const agentsPath = await promptPath("Generic .agents path", defaults.agents.agents);

	const config: DotagentsGlobalConfig = {
		version: 1,
		homeRepo,
		agents: {
			codex: codexPath,
			claude: claudePath,
			agents: agentsPath,
		},
		customSources: [],
	};
	await saveGlobalConfig(config);
	p.outro(pc.green(`Saved global config: ${getGlobalConfigPath()}`));
	return config;
}

export async function initializeHomeRepository(homeRepo: string, initializeGit: boolean): Promise<void> {
	await fs.mkdir(homeRepo, { recursive: true });
	await fs.mkdir(path.join(homeRepo, "prompts"), { recursive: true });
	await fs.mkdir(path.join(homeRepo, "skills"), { recursive: true });
	await fs.mkdir(path.join(homeRepo, "configs"), { recursive: true });
	await fs.mkdir(path.join(homeRepo, "scripts"), { recursive: true });

	const registryPath = path.join(homeRepo, "configs", "skills-registry.tsv");
	if (!(await pathExists(registryPath))) {
		await fs.writeFile(
			registryPath,
			"# skill-path<TAB>source-spec\n# Example: find-skills\tvercel-labs/skills@find-skills\n",
			"utf8",
		);
	}

	const readmePath = path.join(homeRepo, "README.md");
	if (!(await pathExists(readmePath))) {
		await fs.writeFile(
			readmePath,
			"# dotagents home\n\nThis repository stores prompts and skills used by dotagents.\n",
			"utf8",
		);
	}

	const gitignorePath = path.join(homeRepo, ".gitignore");
	if (!(await pathExists(gitignorePath))) {
		await fs.writeFile(gitignorePath, ".DS_Store\n", "utf8");
	}

	if (initializeGit && !(await pathExists(path.join(homeRepo, ".git")))) {
		const result = spawnSync("git", ["init"], { cwd: homeRepo, stdio: "ignore" });
		if (result.status !== 0) {
			p.log.warn("Could not initialize git automatically. Run `git init` in your home repo.");
		}
	}
}

async function promptPath(message: string, initialValue: string): Promise<string> {
	const value = await p.text({
		message,
		initialValue,
		validate(input) {
			if (!input.trim()) {
				return "Path is required.";
			}
			return undefined;
		},
	});
	if (p.isCancel(value)) {
		throw new Error("Canceled first-run setup.");
	}
	return expandTilde(value);
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
