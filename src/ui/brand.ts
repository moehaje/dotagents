import pc from "picocolors";

const LOGO_LINES = [
	"██████╗  ██████╗ ████████╗ █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗",
	"██╔══██╗██╔═══██╗╚══██╔══╝██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝",
	"██║  ██║██║   ██║   ██║   ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗",
	"██║  ██║██║   ██║   ██║   ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║",
	"██████╔╝╚██████╔╝   ██║   ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║",
	"╚═════╝  ╚═════╝    ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝",
] as const;

export function printBanner(): void {
	const palette = [pc.cyan, pc.blueBright, pc.blue, pc.cyan, pc.blueBright, pc.cyan];
	process.stdout.write("\n");
	LOGO_LINES.forEach((line, index) => {
		process.stdout.write(`${palette[index]?.(line) ?? line}\n`);
	});
	process.stdout.write(`${pc.dim("Sync prompts and skills with one canonical home repo.")}\n\n`);
}

export function printHelp(version: string): void {
	printBanner();
	process.stdout.write(`${pc.bold("dotagents")} ${pc.dim(`v${version}`)}\n\n`);
	process.stdout.write(`${pc.bold("Usage")}\n`);
	process.stdout.write("  dotagents <command> [options]\n\n");
	process.stdout.write(`${pc.bold("Commands")}\n`);
	process.stdout.write("  new <prompt|skill> [name]   Create a new asset in dotagents home\n");
	process.stdout.write("  add [prompt|skill] <name>   Copy an asset from home to current project\n");
	process.stdout.write("  scan                        Scan agent directories for unsynced assets\n");
	process.stdout.write("  config                      Configure global paths and home repo\n");
	process.stdout.write("  skill <args...>             Passthrough to `npx skills <args...>`\n");
	process.stdout.write("  --help, -h                  Show help\n");
	process.stdout.write("  --version, -v               Show version\n\n");
	process.stdout.write(`${pc.bold("Examples")}\n`);
	process.stdout.write("  dotagents new prompt\n");
	process.stdout.write("  dotagents add prompt release\n");
	process.stdout.write("  dotagents add skill terminal-ui --force\n");
	process.stdout.write("  dotagents scan --sync\n");
	process.stdout.write("  dotagents config\n");
	process.stdout.write("  dotagents skill add vercel-labs/skills@find-skills\n");
	process.stdout.write("  dotagents skill sync --check\n");
}
