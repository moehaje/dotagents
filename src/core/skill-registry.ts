import fs from "node:fs/promises";
import path from "node:path";
import { hashDirectory, stageSkillSource } from "./skills-cli.js";

export type SkillRegistryEntry = {
	skillPath: string;
	sourceSpec: string;
};

export type SkillRegistryStatus = {
	entry: SkillRegistryEntry;
	status: "up-to-date" | "outdated" | "missing-local" | "missing-remote" | "error";
	message?: string;
};

export async function readSkillRegistry(homeRepo: string): Promise<SkillRegistryEntry[]> {
	const registryPath = path.join(homeRepo, "configs", "skills-registry.tsv");
	try {
		const raw = await fs.readFile(registryPath, "utf8");
		const entries: SkillRegistryEntry[] = [];
		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) {
				continue;
			}
			const [skillPath, sourceSpec] = trimmed.split("\t");
			if (!skillPath || !sourceSpec) {
				continue;
			}
			entries.push({ skillPath, sourceSpec });
		}
		return entries;
	} catch {
		return [];
	}
}

export async function checkRegistryStatus(homeRepo: string): Promise<SkillRegistryStatus[]> {
	const entries = await readSkillRegistry(homeRepo);
	const statuses: SkillRegistryStatus[] = [];

	for (const entry of entries) {
		const localDir = path.join(homeRepo, "skills", entry.skillPath);
		if (!(await pathExists(localDir))) {
			statuses.push({ entry, status: "missing-local" });
			continue;
		}

		const stageResult = await stageSkillSource(entry.sourceSpec, {
			tempPrefix: "dotagents-skill-check-",
		});
		if (!stageResult.success || !stageResult.skillDir) {
			statuses.push({
				entry,
				status: "error",
				message: stageResult.message ?? "Could not stage remote skill.",
			});
			continue;
		}
		try {
			const localHash = await hashDirectory(localDir);
			const remoteHash = stageResult.hash ?? (await hashDirectory(stageResult.skillDir));
			if (localHash === remoteHash) {
				statuses.push({ entry, status: "up-to-date" });
			} else {
				statuses.push({ entry, status: "outdated" });
			}
		} finally {
			await fs.rm(stageResult.skillDir, { recursive: true, force: true });
		}
	}

	return statuses;
}

export async function applyRegistryUpdates(
	homeRepo: string,
	targetEntries: SkillRegistryEntry[],
): Promise<Array<{ entry: SkillRegistryEntry; updated: boolean; message?: string }>> {
	const results: Array<{ entry: SkillRegistryEntry; updated: boolean; message?: string }> = [];
	for (const entry of targetEntries) {
		const stageResult = await stageSkillSource(entry.sourceSpec, {
			tempPrefix: "dotagents-skill-update-",
		});
		if (!stageResult.success || !stageResult.skillDir) {
			results.push({
				entry,
				updated: false,
				message: stageResult.message ?? "Could not stage remote skill.",
			});
			continue;
		}
		try {
			const targetDir = path.join(homeRepo, "skills", entry.skillPath);
			await fs.mkdir(path.dirname(targetDir), { recursive: true });
			await fs.rm(targetDir, { recursive: true, force: true });
			await fs.cp(stageResult.skillDir, targetDir, { recursive: true, force: true });
			results.push({ entry, updated: true });
		} finally {
			await fs.rm(stageResult.skillDir, { recursive: true, force: true });
		}
	}
	return results;
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}
