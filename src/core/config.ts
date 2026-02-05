import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type ScanSource = {
	name: string;
	root: string;
	explicit?: boolean;
};

export function resolveHomeRepository(explicitHome?: string): string {
	if (explicitHome) {
		return expandTilde(explicitHome);
	}

	const envHome = process.env.DOTAGENTS_HOME?.trim();
	if (envHome) {
		return expandTilde(envHome);
	}

	const candidates = [
		path.join(homedir(), "dotagents"),
		path.join(homedir(), "sync", "dev", "hacking", "dot-agents"),
		path.join(homedir(), "sync", "dev", "dot-agents"),
	];
	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return path.join(homedir(), "dotagents");
}

export function defaultScanSources(extraSources: string[] = []): ScanSource[] {
	const codexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), ".codex");
	const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), ".claude");
	const agentsHome = path.join(homedir(), ".agents");

	const sources: ScanSource[] = [
		{ name: "codex", root: codexHome },
		{ name: "claude", root: claudeHome },
		{ name: "agents", root: agentsHome },
	];

	for (const source of extraSources) {
		sources.push({
			name: "custom",
			root: expandTilde(source),
			explicit: true,
		});
	}

	return dedupeSources(sources);
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
