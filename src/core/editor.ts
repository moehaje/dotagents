import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import * as p from "@clack/prompts";

const execFileAsync = promisify(execFile);
const FALLBACK_EDITORS = ["code", "cursor", "zed", "nvim", "vim", "nano"] as const;

export async function resolveEditorCommand(input: {
	explicitEditor?: string;
	configEditor?: string;
	env?: NodeJS.ProcessEnv;
	cwd?: string;
	readGitEditor?: (cwd: string) => Promise<string | null>;
	hasBinary?: (command: string, env: NodeJS.ProcessEnv) => Promise<boolean>;
}): Promise<string | null> {
	const env = input.env ?? process.env;
	const explicit = normalizeEditorValue(input.explicitEditor);
	if (explicit) {
		return explicit;
	}

	const configured = normalizeEditorValue(input.configEditor);
	if (configured) {
		return configured;
	}

	const fromEnv = [
		normalizeEditorValue(env.DOTAGENTS_EDITOR),
		normalizeEditorValue(env.VISUAL),
		normalizeEditorValue(env.EDITOR),
	].find(Boolean);
	if (fromEnv) {
		return fromEnv;
	}

	const getGitEditor = input.readGitEditor ?? readGitCoreEditor;
	const gitEditor = await getGitEditor(input.cwd ?? process.cwd());
	if (gitEditor) {
		return gitEditor;
	}

	const hasBinary = input.hasBinary ?? binaryExists;
	for (const candidate of FALLBACK_EDITORS) {
		if (await hasBinary(candidate, env)) {
			return candidate;
		}
	}

	return null;
}

export async function openInEditor(command: string, filePath: string): Promise<number> {
	const parsed = splitEditorCommand(command);
	if (!parsed || parsed.length === 0) {
		return 1;
	}

	const [bin, ...args] = parsed;
	const child = spawn(bin, [...args, filePath], {
		stdio: "inherit",
		shell: false,
	});
	return await new Promise<number>((resolve) => {
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
}

export async function runInlineEdit(filePath: string): Promise<"saved" | "unchanged" | "canceled"> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error("Inline editing requires an interactive terminal.");
	}

	const existing = await fs.readFile(filePath, "utf8");
	p.log.info(`Inline edit mode for ${filePath}`);
	p.log.info("Paste replacement content. End with EOF on its own line.");

	const lines: string[] = [];
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: true,
	});
	const replacement = await new Promise<string>((resolve) => {
		rl.on("line", (line) => {
			if (line === "EOF") {
				rl.close();
				return;
			}
			lines.push(line);
		});
		rl.on("close", () => {
			resolve(lines.join("\n"));
		});
	});

	const next = replacement.trimEnd();
	const current = existing.trimEnd();
	if (next === current) {
		return "unchanged";
	}

	const confirmed = await p.confirm({
		message: `Save changes to ${filePath}?`,
		initialValue: true,
	});
	if (p.isCancel(confirmed) || !confirmed) {
		return "canceled";
	}

	await writeFileAtomically(filePath, `${next}\n`);
	return "saved";
}

export function splitEditorCommand(command: string): string[] | null {
	const value = command.trim();
	if (!value) {
		return null;
	}

	const args: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaped = false;

	for (const char of value) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}

		if (char === "\\") {
			escaped = true;
			continue;
		}

		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
			continue;
		}

		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}

		if (/\s/.test(char)) {
			if (current.length > 0) {
				args.push(current);
				current = "";
			}
			continue;
		}

		current += char;
	}

	if (escaped || quote) {
		return null;
	}
	if (current.length > 0) {
		args.push(current);
	}
	return args.length > 0 ? args : null;
}

async function readGitCoreEditor(cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", ["config", "--get", "core.editor"], {
			cwd,
			encoding: "utf8",
		});
		return normalizeEditorValue(stdout);
	} catch {
		return null;
	}
}

function normalizeEditorValue(value: string | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

async function binaryExists(command: string, env: NodeJS.ProcessEnv): Promise<boolean> {
	const pathValue = env.PATH ?? "";
	const pathItems = pathValue.split(path.delimiter).filter(Boolean);
	if (pathItems.length === 0) {
		return false;
	}

	const candidates: string[] = [];
	for (const item of pathItems) {
		candidates.push(path.join(item, command));
		if (process.platform === "win32") {
			const extensions = (env.PATHEXT ?? ".EXE;.CMD;.BAT")
				.split(";")
				.filter(Boolean)
				.map((extension) => extension.toLowerCase());
			for (const ext of extensions) {
				candidates.push(path.join(item, `${command}${ext}`));
			}
		}
	}

	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			return true;
		} catch {}
	}
	return false;
}

async function writeFileAtomically(targetPath: string, content: string): Promise<void> {
	const tempPath = path.join(
		path.dirname(targetPath),
		`.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}`,
	);
	await fs.writeFile(tempPath, content, "utf8");
	await fs.rename(tempPath, targetPath);
}
