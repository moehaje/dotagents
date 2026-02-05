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
} from "../core/config.js";
import { initializeHomeRepository, runFirstRunSetup } from "../core/bootstrap.js";

type ConfigOptions = {
	home?: string;
	codex?: string;
	claude?: string;
	agents?: string;
	json?: boolean;
	addSource?: string[];
	clearSources?: boolean;
	list?: boolean;
	help?: boolean;
};

export async function runConfigCommand(args: string[]): Promise<number> {
	const options = parseConfigArgs(args);
	if (options.help) {
		printConfigHelp();
		return 0;
	}

	let config = await loadGlobalConfig();
	if (!config && args.length === 0) {
		config = await runFirstRunSetup();
	}
	config = config ?? buildDefaultConfig(await resolveHomeRepository());
	if (options.home || options.codex || options.claude || options.agents || options.clearSources || options.addSource) {
		config = {
			...config,
			homeRepo: options.home ? expandTilde(options.home) : config.homeRepo,
			agents: {
				codex: options.codex ? expandTilde(options.codex) : config.agents.codex,
				claude: options.claude ? expandTilde(options.claude) : config.agents.claude,
				agents: options.agents ? expandTilde(options.agents) : config.agents.agents,
			},
			customSources: options.clearSources ? [] : config.customSources,
		};
		if (options.addSource?.length) {
			config.customSources = [...config.customSources, ...options.addSource.map(expandTilde)];
		}
		await initializeHomeRepository(config.homeRepo, {
			initializeGit: false,
			allowProjectRoot: true,
		});
		await saveGlobalConfig(config);
	}

	if (options.json || options.list) {
		process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
		return 0;
	}

	if (args.length > 0 && !options.help) {
		process.stdout.write(`${pc.green("Updated config at")} ${getGlobalConfigPath()}\n`);
		return 0;
	}

	await runInteractiveConfig(config);
	return 0;
}

function parseConfigArgs(args: string[]): ConfigOptions {
	const options: ConfigOptions = {};
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) {
			continue;
		}
		switch (arg) {
			case "--help":
			case "-h":
				options.help = true;
				break;
			case "--json":
				options.json = true;
				break;
			case "--list":
				options.list = true;
				break;
			case "--clear-sources":
				options.clearSources = true;
				break;
			case "--home":
			case "--codex":
			case "--claude":
			case "--agents":
			case "--source":
				{
					const value = args[index + 1];
					if (!value || value.startsWith("-")) {
						throw new Error(`Missing value for ${arg}`);
					}
					if (arg === "--home") options.home = value;
					if (arg === "--codex") options.codex = value;
					if (arg === "--claude") options.claude = value;
					if (arg === "--agents") options.agents = value;
					if (arg === "--source") options.addSource = [...(options.addSource ?? []), value];
					index += 1;
				}
				break;
			default:
				throw new Error(`Unknown option for config: ${arg}`);
		}
	}
	return options;
}

async function runInteractiveConfig(initial: DotagentsGlobalConfig): Promise<void> {
	let config = { ...initial, agents: { ...initial.agents }, customSources: [...initial.customSources] };
	p.intro(pc.cyan("dotagents config"));

	let done = false;
	while (!done) {
		const action = await p.select({
			message: "Select config to edit",
			options: [
				{ value: "home", label: `Home repo (${config.homeRepo})` },
				{ value: "codex", label: `Codex path (${config.agents.codex})` },
				{ value: "claude", label: `Claude path (${config.agents.claude})` },
				{ value: "agents", label: `Generic .agents path (${config.agents.agents})` },
				{ value: "add-source", label: "Add custom scan source" },
				{ value: "remove-source", label: "Remove custom scan sources" },
				{ value: "show", label: "Show current config" },
				{ value: "done", label: "Save and exit" },
			],
		});
		if (p.isCancel(action)) {
			p.cancel("Canceled.");
			return;
		}

		switch (action) {
			case "home":
				config.homeRepo = await promptPath("Home repo path", config.homeRepo);
				break;
			case "codex":
				config.agents.codex = await promptPath("Codex path", config.agents.codex);
				break;
			case "claude":
				config.agents.claude = await promptPath("Claude path", config.agents.claude);
				break;
			case "agents":
				config.agents.agents = await promptPath("Generic .agents path", config.agents.agents);
				break;
			case "add-source": {
				const value = await promptPath("Custom source path", "~/");
				config.customSources.push(value);
				break;
			}
			case "remove-source": {
				if (config.customSources.length === 0) {
					p.log.info("No custom sources configured.");
					break;
				}
				const selected = await p.multiselect({
					message: "Select sources to remove",
					options: config.customSources.map((value) => ({ value, label: value })),
				});
				if (p.isCancel(selected)) {
					break;
				}
				const toRemove = new Set(selected);
				config.customSources = config.customSources.filter((item) => !toRemove.has(item));
				break;
			}
			case "show":
				process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
				break;
			case "done":
				done = true;
				break;
			default:
				break;
		}
	}

	await initializeHomeRepository(config.homeRepo, {
		initializeGit: false,
		allowProjectRoot: true,
	});
	await saveGlobalConfig(config);
	p.outro(pc.green(`Saved config at ${getGlobalConfigPath()}`));
}

async function promptPath(message: string, initialValue: string): Promise<string> {
	const input = await p.text({
		message,
		initialValue,
		validate(value) {
			if (!value.trim()) {
				return "Path is required.";
			}
			return undefined;
		},
	});
	if (p.isCancel(input)) {
		throw new Error("Canceled config update.");
	}
	return expandTilde(input);
}

function printConfigHelp(): void {
	process.stdout.write("Usage: dotagents config [options]\n");
	process.stdout.write("  --home <path>      Set home repo path\n");
	process.stdout.write("  --codex <path>     Set codex path\n");
	process.stdout.write("  --claude <path>    Set claude path\n");
	process.stdout.write("  --agents <path>    Set generic .agents path\n");
	process.stdout.write("  --source <path>    Add custom scan source (repeatable)\n");
	process.stdout.write("  --clear-sources    Clear all custom sources\n");
	process.stdout.write("  --list             Print config as JSON\n");
	process.stdout.write("  --json             Print config as JSON\n");
}
