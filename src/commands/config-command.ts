import * as p from "@clack/prompts";
import pc from "picocolors";
import { initializeHomeRepository, runFirstRunSetup } from "../core/bootstrap.js";
import {
	buildDefaultConfig,
	type DotagentsGlobalConfig,
	expandTilde,
	getGlobalConfigPath,
	loadGlobalConfig,
	resolveHomeRepository,
	saveGlobalConfig,
} from "../core/config.js";
import { styleCommand, styleHint, styleLabel, styleSuccess } from "../ui/brand.js";

type ConfigOptions = {
	home?: string;
	editor?: string;
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
	if (
		options.home ||
		options.editor !== undefined ||
		options.codex ||
		options.claude ||
		options.agents ||
		options.clearSources ||
		options.addSource
	) {
		config = {
			...config,
			homeRepo: options.home ? expandTilde(options.home) : config.homeRepo,
			editor:
				options.editor !== undefined
					? options.editor.trim()
						? options.editor.trim()
						: undefined
					: config.editor,
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
		process.stdout.write(
			`${styleSuccess("Updated config at")} ${styleCommand(getGlobalConfigPath())}\n`,
		);
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
			case "--editor":
			case "--codex":
			case "--claude":
			case "--agents":
			case "--source":
				{
					const value = args[index + 1];
					if (
						value === undefined ||
						((arg !== "--editor" || value !== "") && value.startsWith("-"))
					) {
						throw new Error(`Missing value for ${arg}`);
					}
					if (arg === "--home") options.home = value;
					if (arg === "--editor") options.editor = value;
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
	const config = {
		...initial,
		agents: { ...initial.agents },
		customSources: [...initial.customSources],
	};
	p.intro(pc.cyan("dotagents config"));

	let done = false;
	while (!done) {
		const action = await p.select({
			message: "Select config to edit",
			options: [
				{ value: "home", label: `Home repo (${config.homeRepo})` },
				{ value: "editor", label: `Editor command (${config.editor ?? "not set"})` },
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
			case "editor":
				config.editor = await promptOptional(
					"Editor command (empty to clear; e.g. code --wait)",
					config.editor,
				);
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

async function promptOptional(message: string, initialValue?: string): Promise<string | undefined> {
	const input = await p.text({
		message,
		initialValue: initialValue ?? "",
	});
	if (p.isCancel(input)) {
		throw new Error("Canceled config update.");
	}
	const value = input.trim();
	return value.length > 0 ? value : undefined;
}

function printConfigHelp(): void {
	const writeOption = (flag: string, description: string) => {
		process.stdout.write(`  ${styleCommand(flag.padEnd(30))} ${styleHint(description)}\n`);
	};

	process.stdout.write(`${styleLabel("Usage")}: ${styleCommand("dotagents config [options]")}\n`);
	process.stdout.write(`${styleLabel("Options")}\n`);
	writeOption("--home <path>", "Set home repo path");
	writeOption("--editor <cmd>", "Set editor command (empty string clears)");
	writeOption("--codex <path>", "Set codex path");
	writeOption("--claude <path>", "Set claude path");
	writeOption("--agents <path>", "Set generic .agents path");
	writeOption("--source <path>", "Add custom scan source (repeatable)");
	writeOption("--clear-sources", "Clear all custom sources");
	writeOption("--list", "Print config as JSON");
	writeOption("--json", "Print config as JSON");
	writeOption("--help, -h", "Show this help");
}
