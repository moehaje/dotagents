import { describe, expect, it } from "vitest";
import { resolveEditorCommand, splitEditorCommand } from "../src/core/editor.js";

describe("splitEditorCommand", () => {
	it("parses quoted editor commands", () => {
		expect(splitEditorCommand('code --wait "my file.md"')).toEqual([
			"code",
			"--wait",
			"my file.md",
		]);
		expect(splitEditorCommand("nvim")).toEqual(["nvim"]);
	});

	it("returns null for invalid command syntax", () => {
		expect(splitEditorCommand('"code --wait')).toBeNull();
		expect(splitEditorCommand("")).toBeNull();
	});
});

describe("resolveEditorCommand", () => {
	it("uses explicit editor before all other sources", async () => {
		const command = await resolveEditorCommand({
			explicitEditor: "zed --wait",
			configEditor: "code --wait",
			env: {
				DOTAGENTS_EDITOR: "nvim",
				PATH: "",
			},
			readGitEditor: async () => "vim",
			hasBinary: async () => true,
		});
		expect(command).toBe("zed --wait");
	});

	it("prefers config editor when explicit editor is missing", async () => {
		const command = await resolveEditorCommand({
			configEditor: "cursor --wait",
			env: {
				DOTAGENTS_EDITOR: "nvim",
				PATH: "",
			},
			readGitEditor: async () => "vim",
			hasBinary: async () => true,
		});
		expect(command).toBe("cursor --wait");
	});

	it("uses env precedence DOTAGENTS_EDITOR > VISUAL > EDITOR", async () => {
		const command = await resolveEditorCommand({
			env: {
				DOTAGENTS_EDITOR: "zed",
				VISUAL: "nvim",
				EDITOR: "vim",
				PATH: "",
			},
			readGitEditor: async () => null,
			hasBinary: async () => false,
		});
		expect(command).toBe("zed");
	});

	it("uses git core.editor if no explicit/config/env editor is set", async () => {
		const command = await resolveEditorCommand({
			env: { PATH: "" },
			readGitEditor: async () => "vim -u NONE",
			hasBinary: async () => false,
		});
		expect(command).toBe("vim -u NONE");
	});

	it("falls back to known binaries in order", async () => {
		const command = await resolveEditorCommand({
			env: { PATH: "" },
			readGitEditor: async () => null,
			hasBinary: async (candidate) => candidate === "zed",
		});
		expect(command).toBe("zed");
	});

	it("returns null when no editor source resolves", async () => {
		const command = await resolveEditorCommand({
			env: { PATH: "" },
			readGitEditor: async () => null,
			hasBinary: async () => false,
		});
		expect(command).toBeNull();
	});
});
