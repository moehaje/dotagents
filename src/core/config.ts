import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
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

type BuiltInSourcePaths = {
	home: string;
	configHome: string;
	codexHome: string;
	claudeHome: string;
	agentsHome: string;
};

export function getGlobalConfigPath(): string {
	const base = resolveConfigHome();
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

	const detected = await detectHomeRepoFromFilesystem({
		excludePaths: [process.cwd()],
	});
	if (detected) {
		return detected;
	}

	return path.join(homedir(), "dotagents");
}

export async function defaultScanSources(extraSources: string[] = []): Promise<ScanSource[]> {
	const stored = await loadGlobalConfig();
	const defaults = buildDefaultConfig(path.join(homedir(), "dotagents"));
	const paths: BuiltInSourcePaths = {
		home: homedir(),
		configHome: resolveConfigHome(),
		codexHome: stored?.agents.codex ?? defaults.agents.codex,
		claudeHome: stored?.agents.claude ?? defaults.agents.claude,
		agentsHome: stored?.agents.agents ?? defaults.agents.agents,
	};

	const sources: ScanSource[] = buildBuiltInScanSources(paths);

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

export function buildBuiltInScanSources(paths: BuiltInSourcePaths): ScanSource[] {
	return [
		{ name: "codex", root: paths.codexHome },
		{ name: "claude", root: paths.claudeHome },
		{ name: "agents", root: paths.agentsHome },
		{ name: "amp", root: path.join(paths.configHome, "agents") },
		{ name: "antigravity", root: path.join(paths.home, ".gemini", "antigravity") },
		{ name: "augment", root: path.join(paths.home, ".augment") },
		{ name: "openclaw", root: path.join(paths.home, ".openclaw") },
		{ name: "clawdbot", root: path.join(paths.home, ".clawdbot") },
		{ name: "moltbot", root: path.join(paths.home, ".moltbot") },
		{ name: "cline", root: path.join(paths.home, ".cline") },
		{ name: "codebuddy", root: path.join(paths.home, ".codebuddy") },
		{ name: "command-code", root: path.join(paths.home, ".commandcode") },
		{ name: "continue", root: path.join(paths.home, ".continue") },
		{ name: "crush", root: path.join(paths.configHome, "crush") },
		{ name: "cursor", root: path.join(paths.home, ".cursor") },
		{ name: "droid", root: path.join(paths.home, ".factory") },
		{ name: "gemini-cli", root: path.join(paths.home, ".gemini") },
		{ name: "github-copilot", root: path.join(paths.home, ".copilot") },
		{ name: "goose", root: path.join(paths.configHome, "goose") },
		{ name: "junie", root: path.join(paths.home, ".junie") },
		{ name: "iflow-cli", root: path.join(paths.home, ".iflow") },
		{ name: "kilo", root: path.join(paths.home, ".kilocode") },
		{ name: "kimi-cli", root: path.join(paths.configHome, "agents") },
		{ name: "kiro-cli", root: path.join(paths.home, ".kiro") },
		{ name: "kode", root: path.join(paths.home, ".kode") },
		{ name: "mcpjam", root: path.join(paths.home, ".mcpjam") },
		{ name: "mistral-vibe", root: path.join(paths.home, ".vibe") },
		{ name: "mux", root: path.join(paths.home, ".mux") },
		{ name: "opencode", root: path.join(paths.configHome, "opencode") },
		{ name: "openhands", root: path.join(paths.home, ".openhands") },
		{ name: "pi", root: path.join(paths.home, ".pi", "agent") },
		{ name: "qoder", root: path.join(paths.home, ".qoder") },
		{ name: "qwen-code", root: path.join(paths.home, ".qwen") },
		{ name: "roo", root: path.join(paths.home, ".roo") },
		{ name: "trae", root: path.join(paths.home, ".trae") },
		{ name: "trae-cn", root: path.join(paths.home, ".trae-cn") },
		{ name: "windsurf", root: path.join(paths.home, ".codeium", "windsurf") },
		{ name: "zencoder", root: path.join(paths.home, ".zencoder") },
		{ name: "neovate", root: path.join(paths.home, ".neovate") },
		{ name: "pochi", root: path.join(paths.home, ".pochi") },
		{ name: "adal", root: path.join(paths.home, ".adal") },
	];
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

function resolveConfigHome(): string {
	const xdg = process.env.XDG_CONFIG_HOME?.trim();
	return xdg && xdg.length > 0 ? expandTilde(xdg) : path.join(homedir(), ".config");
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

export async function detectHomeRepoFromFilesystem(options?: {
	excludePaths?: string[];
}): Promise<string | null> {
	const roots = [homedir()];
	const matches = await findDirectoriesByName(roots, HOME_REPO_NAMES, 4);
	const excluded = new Set((options?.excludePaths ?? []).map((value) => path.resolve(value)));
	const filtered = matches.filter((candidate) => !excluded.has(path.resolve(candidate)));
	const ranked = await rankHomeRepoCandidates(filtered);
	return ranked[0] ?? null;
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

async function rankHomeRepoCandidates(candidates: string[]): Promise<string[]> {
	const scored = await Promise.all(
		candidates.map(async (candidate) => ({
			candidate,
			score: await scoreHomeRepoCandidate(candidate),
		})),
	);
	return scored
		.sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
		.map((item) => item.candidate);
}

async function scoreHomeRepoCandidate(candidate: string): Promise<number> {
	let score = 0;
	if (await pathExists(path.join(candidate, "prompts"))) score += 3;
	if (await pathExists(path.join(candidate, "skills"))) score += 3;
	if (await pathExists(path.join(candidate, "configs", "skills-registry.tsv"))) score += 3;
	if (await pathExists(path.join(candidate, ".git"))) score += 1;
	return score;
}
