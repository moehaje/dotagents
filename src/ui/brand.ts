import pc from "picocolors";

const LOGO_LINES = [
	"    █████╗  ██████╗ ███████╗███╗   ██╗████████╗███████╗",
	"   ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██╔════╝",
	"   ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ███████╗",
	"   ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ╚════██║",
	"██╗██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ███████║",
	"╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝",
] as const;

const LOGO_GRADIENT_START = "#FFB5B3";
const LOGO_GRADIENT_END = "#F55650";
const LOGO_SIGNATURE = "by artsnlabs";
const BADGE_BG = "#FFB5B3";
const BADGE_FG = "#451716";

export function printBanner(): void {
	const start = parseHexColor(LOGO_GRADIENT_START);
	const end = parseHexColor(LOGO_GRADIENT_END);
	const count = LOGO_LINES.length;
	process.stdout.write("\n");

	for (let index = 0; index < count; index += 1) {
		const ratio = count > 1 ? index / (count - 1) : 0;
		const color = mixRgb(start, end, ratio);
		const line = withForeground(LOGO_LINES[index], color);
		if (index === count - 1) {
			process.stdout.write(`${line} ${withDim(LOGO_SIGNATURE)}\n`);
			continue;
		}
		process.stdout.write(`${line}\n`);
	}

	process.stdout.write("\n");
}

export function printHelp(version: string): void {
	process.stdout.write(`${pc.bold("dotagents")} ${pc.dim(`v${version}`)}\n\n`);
	process.stdout.write(`${pc.bold("Usage")}\n`);
	process.stdout.write(`  ${styleCommand("dotagents <command> [options]")}\n\n`);
	process.stdout.write(`${pc.bold("Commands")}\n`);
	writeHelpRow("create <prompt|skill> [name]", "Create an asset in dotagents home");
	writeHelpRow("new <prompt|skill> [name]", "Alias for create");
	writeHelpRow("add [prompt|skill] <name>", "Copy an asset from home to current project");
	writeHelpRow("init", "Scaffold project-local .agents layout");
	writeHelpRow("edit [prompt|skill] [name]", "Edit an asset from home/project/global targets");
	writeHelpRow("check [prompt|skill]", "Validate home prompt and skill assets");
	writeHelpRow("scan", "Scan agent directories for unsynced assets");
	writeHelpRow("config", "Configure global paths and home repo");
	writeHelpRow("skill <args...>", "Passthrough to `npx skills <args...>`");
	writeHelpRow("--help, -h", "Show help");
	writeHelpRow("--version, -v", "Show version");
	process.stdout.write(`\n${pc.bold("Examples")}\n`);
	writeExample("dotagents create prompt");
	writeExample("dotagents init -p");
	writeExample("dotagents add prompt release");
	writeExample("dotagents edit prompt release");
	writeExample("dotagents check --strict");
	writeExample("dotagents add skill terminal-ui --force");
	writeExample("dotagents scan --sync");
	writeExample("dotagents config");
	writeExample("dotagents skill add vercel-labs/skills@find-skills");
	writeExample("dotagents skill sync --check");
}

export function styleBadge(text: string): string {
	return withBackground(` ${text} `, parseHexColor(BADGE_BG), parseHexColor(BADGE_FG));
}

export function styleCommand(text: string): string {
	return pc.white(text);
}

export function styleHint(text: string): string {
	return pc.dim(text);
}

export function styleLabel(text: string): string {
	return pc.bold(text);
}

export function styleSuccess(text: string): string {
	return pc.green(text);
}

export function styleWarning(text: string): string {
	return pc.yellow(text);
}

export function styleError(text: string): string {
	return pc.red(text);
}

function parseHexColor(hex: string): [number, number, number] {
	const value = hex.replace("#", "");
	if (value.length !== 6) {
		return [255, 255, 255];
	}
	const red = Number.parseInt(value.slice(0, 2), 16);
	const green = Number.parseInt(value.slice(2, 4), 16);
	const blue = Number.parseInt(value.slice(4, 6), 16);
	return [red, green, blue];
}

function mixRgb(
	start: [number, number, number],
	end: [number, number, number],
	ratio: number,
): [number, number, number] {
	const clamp = Math.max(0, Math.min(1, ratio));
	return [
		Math.round(start[0] + (end[0] - start[0]) * clamp),
		Math.round(start[1] + (end[1] - start[1]) * clamp),
		Math.round(start[2] + (end[2] - start[2]) * clamp),
	];
}

function withForeground(text: string, color: [number, number, number]): string {
	return `\u001B[38;2;${color[0]};${color[1]};${color[2]}m${text}\u001B[0m`;
}

function withBackground(
	text: string,
	background: [number, number, number],
	foreground?: [number, number, number],
): string {
	const fg = foreground ? `\u001B[38;2;${foreground[0]};${foreground[1]};${foreground[2]}m` : "";
	return `\u001B[48;2;${background[0]};${background[1]};${background[2]}m${fg}${text}\u001B[0m`;
}

function withDim(text: string): string {
	return `\u001B[2m${text}\u001B[0m`;
}

function writeHelpRow(command: string, description: string): void {
	process.stdout.write(`  ${styleCommand(command.padEnd(30))} ${styleHint(description)}\n`);
}

function writeExample(command: string): void {
	process.stdout.write(`  ${styleHint("$")} ${styleCommand(command)}\n`);
}
