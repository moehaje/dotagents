import { spawn } from "node:child_process";

export async function runSkillCommand(args: string[]): Promise<number> {
	if (args.includes("--help") || args.includes("-h")) {
		printSkillHelp();
		return 0;
	}

	const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
	const child = spawn(npxCmd, ["skills", ...args], {
		stdio: "inherit",
		shell: false,
	});

	return await new Promise<number>((resolve) => {
		child.on("close", (code) => {
			resolve(code ?? 1);
		});
		child.on("error", () => {
			resolve(1);
		});
	});
}

function printSkillHelp(): void {
	process.stdout.write("Usage: dotagents skill <skills-cli-args...>\n");
	process.stdout.write("Example: dotagents skill add vercel-labs/skills@find-skills\n");
}
