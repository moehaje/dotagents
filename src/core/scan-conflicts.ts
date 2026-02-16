import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AssetKind, DiscoveredAsset } from "./types.js";

export type ScanConflictState =
	| "no-conflict"
	| "content-drift"
	| "home-modified-untracked"
	| "home-untracked"
	| "ambiguous-multi-source";

export type ScanDiffSummary = {
	summary: string;
	preview?: string[];
};

export type ScanConflict = {
	kind: AssetKind;
	id: string;
	state: ScanConflictState;
	reason: string;
	recommendation: string;
	sources: string[];
	diff?: ScanDiffSummary;
};

type AssetFingerprint = {
	hash: string;
	description: string;
	previewLines?: string[];
};

export async function buildScanConflicts(options: {
	home: string;
	discoveredAssets: DiscoveredAsset[];
	trackedFiles: Set<string>;
	includeDiff?: boolean;
	includeDiffFull?: boolean;
}): Promise<ScanConflict[]> {
	const groups = groupByKindAndId(options.discoveredAssets);
	const conflicts: ScanConflict[] = [];

	for (const [key, assets] of groups) {
		const [kind, id] = parseKey(key);
		const sourceFingerprints = await Promise.all(
			assets.map(async (asset) => ({
				asset,
				fingerprint: await fingerprintAsset(
					asset.kind,
					asset.path,
					Boolean(options.includeDiffFull),
				),
			})),
		);
		const uniqueSourceHashes = new Set(sourceFingerprints.map((item) => item.fingerprint.hash));
		const sourceLabels = [...new Set(assets.map((asset) => asset.source))].sort();
		const homePath =
			kind === "prompt"
				? path.join(options.home, "prompts", `${id}.md`)
				: path.join(options.home, "skills", id);
		const homeExists = await pathExists(homePath);

		const homeFingerprint = homeExists
			? await fingerprintAsset(kind, homePath, Boolean(options.includeDiffFull))
			: null;

		const homeTracked =
			kind === "prompt"
				? options.trackedFiles.has(`prompts/${id}.md`)
				: [...options.trackedFiles].some((file) => file.startsWith(`skills/${id}/`));

		let state: ScanConflictState = "no-conflict";
		let reason = "No detected conflict for this asset id.";
		let recommendation = "No action required.";
		let diff: ScanDiffSummary | undefined;

		if (uniqueSourceHashes.size > 1) {
			state = "ambiguous-multi-source";
			reason = "Multiple sources provide different content for the same asset id.";
			recommendation = "Use --sync-select with one source path after reviewing --diff-full.";
			diff = {
				summary: `Found ${uniqueSourceHashes.size} distinct source variants.`,
				preview: options.includeDiffFull
					? sourceFingerprints.flatMap((item) => [
							`source ${item.asset.source}: ${item.asset.path}`,
							`  ${item.fingerprint.description}`,
						])
					: undefined,
			};
		} else if (homeExists && homeFingerprint) {
			const sourceFingerprint = sourceFingerprints[0]?.fingerprint;
			if (sourceFingerprint && sourceFingerprint.hash !== homeFingerprint.hash) {
				state = homeTracked ? "content-drift" : "home-modified-untracked";
				reason =
					state === "content-drift"
						? "Home asset content differs from discovered source content."
						: "Home asset differs from source and is not git-tracked.";
				recommendation =
					state === "content-drift"
						? "Review drift with --diff-full before syncing."
						: "Review and track home asset, then sync intentionally.";
				diff = buildDiffSummary(
					kind,
					homeFingerprint,
					sourceFingerprint,
					Boolean(options.includeDiffFull),
				);
			} else if (!homeTracked) {
				state = "home-untracked";
				reason = "Home asset exists but is not git-tracked.";
				recommendation = "Track the home asset in git to avoid accidental drift.";
			}
		}

		if (!options.includeDiff && !options.includeDiffFull) {
			diff = undefined;
		}

		conflicts.push({
			kind,
			id,
			state,
			reason,
			recommendation,
			sources: sourceLabels,
			diff,
		});
	}

	return conflicts.sort(
		(left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id),
	);
}

function groupByKindAndId(discoveredAssets: DiscoveredAsset[]): Map<string, DiscoveredAsset[]> {
	const grouped = new Map<string, DiscoveredAsset[]>();
	for (const asset of discoveredAssets) {
		const key = `${asset.kind}:${asset.id}`;
		const existing = grouped.get(key);
		if (existing) {
			existing.push(asset);
			continue;
		}
		grouped.set(key, [asset]);
	}
	return grouped;
}

function parseKey(key: string): [AssetKind, string] {
	const [kindRaw, ...idParts] = key.split(":");
	return [kindRaw as AssetKind, idParts.join(":")];
}

async function fingerprintAsset(
	kind: AssetKind,
	targetPath: string,
	includePreview: boolean,
): Promise<AssetFingerprint> {
	if (kind === "prompt") {
		const content = await fs.readFile(targetPath, "utf8");
		return {
			hash: sha(content),
			description: `${content.split(/\r?\n/).length} lines`,
			previewLines: includePreview ? content.split(/\r?\n/).slice(0, 10) : undefined,
		};
	}

	const files = await collectDirectoryFiles(targetPath);
	const hasher = createHash("sha256");
	for (const file of files) {
		const rel = path.relative(targetPath, file).replaceAll(path.sep, "/");
		const content = await fs.readFile(file);
		hasher.update(rel);
		hasher.update("\n");
		hasher.update(content);
		hasher.update("\n");
	}
	return {
		hash: hasher.digest("hex"),
		description: `${files.length} file(s)`,
		previewLines: includePreview
			? files.slice(0, 10).map((file) => path.relative(targetPath, file).replaceAll(path.sep, "/"))
			: undefined,
	};
}

async function collectDirectoryFiles(root: string): Promise<string[]> {
	const entries = await fs.readdir(root, { withFileTypes: true });
	const output: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(root, entry.name);
		if (entry.isDirectory()) {
			output.push(...(await collectDirectoryFiles(entryPath)));
			continue;
		}
		if (entry.isFile()) {
			output.push(entryPath);
		}
	}
	return output.sort((left, right) => left.localeCompare(right));
}

function buildDiffSummary(
	kind: AssetKind,
	home: AssetFingerprint,
	source: AssetFingerprint,
	includePreview: boolean,
): ScanDiffSummary {
	if (kind === "prompt") {
		const preview =
			includePreview && home.previewLines && source.previewLines
				? buildPromptPreview(home.previewLines, source.previewLines)
				: undefined;
		return {
			summary: `home(${home.description}) != source(${source.description})`,
			preview,
		};
	}
	return {
		summary: `home(${home.description}) != source(${source.description})`,
		preview:
			includePreview && home.previewLines && source.previewLines
				? [
						"home files:",
						...home.previewLines.map((line) => `  ${line}`),
						"source files:",
						...source.previewLines.map((line) => `  ${line}`),
					]
				: undefined,
	};
}

function buildPromptPreview(homeLines: string[], sourceLines: string[]): string[] {
	const max = Math.max(homeLines.length, sourceLines.length);
	const output: string[] = [];
	for (let index = 0; index < max; index += 1) {
		const homeLine = homeLines[index] ?? "";
		const sourceLine = sourceLines[index] ?? "";
		if (homeLine === sourceLine) {
			continue;
		}
		output.push(`line ${index + 1} home:   ${homeLine}`);
		output.push(`line ${index + 1} source: ${sourceLine}`);
		if (output.length >= 8) {
			break;
		}
	}
	return output;
}

function sha(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
