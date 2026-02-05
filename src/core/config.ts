import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type ScanSource = {
	name: string;
	root: string;
	explicit?: boolean;
};

export type DotagentsGlobalConfig = {
	version: 1;
	homeRepo: string;
	agents: {
		codex: string;
		claude: string;
		agents: string;
	};
	customSources: string[];
};

export function getGlobalConfigPath(): string {
	const xdg = process.env.XDG_CONFIG_HOME?.trim();
	const base = xdg && xdg.length > 0 ? expandTilde(xdg) : path.join(homedir(), ".config");
	return path.join(base, "dotagents", "config.json");
}

export async function loadGlobalConfig(): Promise<DotagentsGlobalConfig | null> {
	const filePath = getGlobalConfigPath();
	try {
		const raw = await fs.readFile(filePath, "utf8");
		const parsed = JSON.parse(raw) as Partial<DotagentsGlobalConfig>;
		if (!parsed || typeof parsed !== "object") {
			return null;
		}
		const defaults = buildDefaultConfig(path.join(homedir(), "dotagents"));
		return {
			version: 1,
			homeRepo: parsed.homeRepo ? expandTilde(parsed.homeRepo) : defaults.homeRepo,
			agents: {
				codex: parsed.agents?.codex ? expandTilde(parsed.agents.codex) : defaults.agents.codex,
				claude: parsed.agents?.claude ? expandTilde(parsed.agents.claude) : defaults.agents.claude,
				agents: parsed.agents?.agents ? expandTilde(parsed.agents.agents) : defaults.agents.agents,
			},
			customSources: (parsed.customSources ?? []).map(expandTilde),
		};
	} catch {
		return null;
	}
}

export async function saveGlobalConfig(config: DotagentsGlobalConfig): Promise<void> {
	const filePath = getGlobalConfigPath();
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function resolveHomeRepository(explicitHome?: string): Promise<string> {
	if (explicitHome) {
		return expandTilde(explicitHome);
	}

	const envHome = process.env.DOTAGENTS_HOME?.trim();
	if (envHome) {
		return expandTilde(envHome);
	}

	const stored = await loadGlobalConfig();
	if (stored?.homeRepo) {
		return stored.homeRepo;
	}

	const detected = await detectHomeRepoFromFilesystem();
	if (detected) {
		return detected;
	}

	return path.join(homedir(), "dotagents");
}

export async function defaultScanSources(extraSources: string[] = []): Promise<ScanSource[]> {
	const stored = await loadGlobalConfig();
	const defaults = buildDefaultConfig(path.join(homedir(), "dotagents"));
	const codexHome = stored?.agents.codex ?? defaults.agents.codex;
	const claudeHome = stored?.agents.claude ?? defaults.agents.claude;
	const agentsHome = stored?.agents.agents ?? defaults.agents.agents;

	const sources: ScanSource[] = [
		{ name: "codex", root: codexHome },
		{ name: "claude", root: claudeHome },
		{ name: "agents", root: agentsHome },
	];

	for (const custom of stored?.customSources ?? []) {
		sources.push({ name: "custom", root: custom, explicit: true });
	}
	for (const source of extraSources) {
		sources.push({
			name: "custom",
			root: expandTilde(source),
			explicit: true,
		});
	}

	return dedupeSources(sources);
}

export function buildDefaultConfig(homeRepo: string): DotagentsGlobalConfig {
	const codexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), ".codex");
	const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), ".claude");
	const agentsHome = path.join(homedir(), ".agents");
	return {
		version: 1,
		homeRepo: expandTilde(homeRepo),
		agents: {
			codex: expandTilde(codexHome),
			claude: expandTilde(claudeHome),
			agents: expandTilde(agentsHome),
		},
		customSources: [],
	};
}

export function expandTilde(input: string): string {
	const value = input.trim();
	if (!value.startsWith("~")) {
		return path.resolve(value);
	}
	if (value === "~") {
		return homedir();
	}
	return path.resolve(path.join(homedir(), value.slice(2)));
}

function dedupeSources(sources: ScanSource[]): ScanSource[] {
	const seen = new Set<string>();
	const deduped: ScanSource[] = [];
	for (const source of sources) {
		const key = path.resolve(source.root);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		deduped.push({ ...source, root: key });
	}
	return deduped;
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

const HOME_REPO_NAMES = new Set(["dotagents", "dot-agents"]);
const SEARCH_SKIP_DIRS = new Set([
	".git",
	"node_modules",
	".cache",
	"Library",
	".Trash",
	"Applications",
	"Movies",
	"Music",
	"Pictures",
	"Downloads",
]);

export async function detectHomeRepoFromFilesystem(): Promise<string | null> {
	const roots = [homedir()];
	const matches = await findDirectoriesByName(roots, HOME_REPO_NAMES, 4);
	return matches[0] ?? null;
}

export async function findDirectoriesByName(
	roots: string[],
	names: ReadonlySet<string>,
	maxDepth: number,
): Promise<string[]> {
	const queue: Array<{ dir: string; depth: number }> = roots.map((dir) => ({
		dir: path.resolve(dir),
		depth: 0,
	}));
	const seen = new Set<string>();
	const matches: string[] = [];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) continue;
		if (seen.has(current.dir)) continue;
		seen.add(current.dir);

		let entries: Dirent[];
		try {
			entries = await fs.readdir(current.dir, { withFileTypes: true, encoding: "utf8" });
		} catch {
			continue;
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const entryPath = path.join(current.dir, entry.name);
			if (names.has(entry.name)) {
				matches.push(entryPath);
			}

			if (current.depth >= maxDepth) continue;
			if (SEARCH_SKIP_DIRS.has(entry.name)) continue;
			if (entry.name.startsWith(".")) continue;
			queue.push({ dir: entryPath, depth: current.depth + 1 });
		}
	}

	return matches.sort();
}
