import { homedir } from "node:os";
import path from "node:path";
import { buildDefaultConfig, loadGlobalConfig } from "./config.js";

export type AssetKind = "prompt" | "skill";

export type TargetSelectionOptions = {
	project?: boolean;
	global?: boolean;
	agents?: string[];
};

export type ResolvedCreateEditTarget = {
	id: string;
	label: string;
	path: string;
};

export type GlobalAgentRoot = {
	id: string;
	label: string;
	root: string;
};

export type SkillFilePathValidation =
	| { valid: true; normalizedPath: string }
	| { valid: false; reason: string };

export function hasExplicitTargetSelection(options: TargetSelectionOptions): boolean {
	return Boolean(options.project || options.global || (options.agents?.length ?? 0) > 0);
}

export async function listGlobalAgentRoots(): Promise<GlobalAgentRoot[]> {
	const stored = await loadGlobalConfig();
	const defaults = buildDefaultConfig(path.join(homedir(), "dotagents"));
	const custom = stored?.customSources ?? [];
	return [
		{ id: "codex", label: "codex", root: stored?.agents.codex ?? defaults.agents.codex },
		{ id: "claude", label: "claude", root: stored?.agents.claude ?? defaults.agents.claude },
		{ id: "agents", label: "agents", root: stored?.agents.agents ?? defaults.agents.agents },
		...custom.map((root, index) => ({
			id: `custom-${index + 1}`,
			label: `custom ${index + 1}`,
			root,
		})),
	];
}

export function projectAgentRoot(agentId: string, cwd = process.cwd()): string {
	if (agentId === "codex") {
		return path.join(cwd, ".codex");
	}
	if (agentId === "claude") {
		return path.join(cwd, ".claude");
	}
	return path.join(cwd, ".agents");
}

export async function resolveCreateEditTargets(input: {
	kind: AssetKind;
	assetId: string;
	home: string;
	options: TargetSelectionOptions;
	cwd?: string;
}): Promise<ResolvedCreateEditTarget[]> {
	const globalRoots = await listGlobalAgentRoots();
	return resolveCreateEditTargetsWithRoots({
		...input,
		globalRoots,
	});
}

export function resolveCreateEditTargetsWithRoots(input: {
	kind: AssetKind;
	assetId: string;
	home: string;
	options: TargetSelectionOptions;
	globalRoots: GlobalAgentRoot[];
	cwd?: string;
}): ResolvedCreateEditTarget[] {
	const targets: ResolvedCreateEditTarget[] = [];
	const seen = new Set<string>();
	const useExplicitTargets = hasExplicitTargetSelection(input.options);
	const selectedAgents = [...new Set(input.options.agents ?? [])];
	const cwd = input.cwd ?? process.cwd();

	if (!useExplicitTargets) {
		addTarget(targets, seen, {
			id: "home",
			label: "Home",
			path: buildAssetPath(input.kind, path.join(input.home), input.assetId),
		});
		return targets;
	}

	if (input.options.project) {
		if (selectedAgents.length > 0) {
			for (const agentId of selectedAgents) {
				addTarget(targets, seen, {
					id: `project-${agentId}`,
					label: `Project: ${agentId}`,
					path: buildAssetPath(input.kind, projectAgentRoot(agentId, cwd), input.assetId),
				});
			}
		} else {
			addTarget(targets, seen, {
				id: "project",
				label: "Project",
				path: buildAssetPath(input.kind, path.join(cwd, ".agents"), input.assetId),
			});
		}
	}

	if (input.options.global) {
		const roots =
			selectedAgents.length > 0
				? input.globalRoots.filter((root) => selectedAgents.includes(root.id))
				: input.globalRoots;
		for (const root of roots) {
			addTarget(targets, seen, {
				id: `global-${root.id}`,
				label: `Global: ${root.label}`,
				path: buildAssetPath(input.kind, root.root, input.assetId),
			});
		}
	}

	if (!input.options.project && !input.options.global && selectedAgents.length > 0) {
		for (const agentId of selectedAgents) {
			const matched = input.globalRoots.find((root) => root.id === agentId);
			if (!matched) {
				continue;
			}
			addTarget(targets, seen, {
				id: `agent-${matched.id}`,
				label: `Agent: ${matched.label}`,
				path: buildAssetPath(input.kind, matched.root, input.assetId),
			});
		}
	}

	return targets;
}

export function validateSkillFileHelperPath(input: string): SkillFilePathValidation {
	const trimmed = input.trim();
	if (!trimmed) {
		return { valid: false, reason: "Skill file path is required." };
	}

	if (isAbsolutePath(trimmed)) {
		return { valid: false, reason: "Skill file path must be relative." };
	}

	const posixInput = toPosixPath(trimmed);
	const rawSegments = posixInput.split("/").filter(Boolean);
	if (rawSegments.some((segment) => segment === "..")) {
		return { valid: false, reason: "Skill file path cannot include '..' traversal." };
	}

	const normalizedPath = path.posix.normalize(posixInput).replace(/^\.\/+/, "");
	const normalizedSegments = normalizedPath
		.split("/")
		.filter((segment) => segment.length > 0 && segment !== ".");
	if (normalizedSegments.length === 0) {
		return { valid: false, reason: "Skill file path is required." };
	}

	return { valid: true, normalizedPath: normalizedSegments.join("/") };
}

function buildAssetPath(kind: AssetKind, root: string, assetId: string): string {
	if (kind === "prompt") {
		return path.join(root, "prompts", `${assetId}.md`);
	}
	return path.join(root, "skills", assetId, "SKILL.md");
}

function addTarget(
	targets: ResolvedCreateEditTarget[],
	seen: Set<string>,
	target: ResolvedCreateEditTarget,
): void {
	const normalized = path.resolve(target.path);
	if (seen.has(normalized)) {
		return;
	}
	seen.add(normalized);
	targets.push({ ...target, path: normalized });
}

function isAbsolutePath(input: string): boolean {
	return path.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith("\\\\");
}

function toPosixPath(input: string): string {
	return input.replaceAll("\\", "/");
}
