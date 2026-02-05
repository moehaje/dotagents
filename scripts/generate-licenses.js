#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function getLicenseText(pkgPath) {
	const possibleFiles = ["LICENSE", "LICENSE.md", "LICENSE.txt", "license", "license.md"];
	for (const file of possibleFiles) {
		const filePath = join(pkgPath, file);
		if (existsSync(filePath)) {
			return readFileSync(filePath, "utf-8").trim();
		}
	}
	return "";
}

function normalizePackageName(packageWithVersion) {
	if (packageWithVersion.startsWith("@")) {
		const match = packageWithVersion.match(/^(@[^/]+\/[^@]+)@/);
		return match ? match[1] : packageWithVersion;
	}
	const index = packageWithVersion.lastIndexOf("@");
	return index > 0 ? packageWithVersion.slice(0, index) : packageWithVersion;
}

function main() {
	process.stdout.write("Generating ThirdPartyNoticeText.txt...\n");

	const output = execSync("npx --no-install license-checker --production --json", {
		encoding: "utf-8",
	});
	const licenses = JSON.parse(output);
	const entries = Object.entries(licenses).sort(([left], [right]) => left.localeCompare(right));

	const lines = [
		"/*!----------------- dotagents ThirdPartyNotices -------------------------------------------------------",
		"",
		"The dotagents CLI incorporates third party material from the projects listed below.",
		"The original copyright notice and the license under which this material was received",
		"are set forth below. These licenses and notices are provided for informational purposes only.",
		"",
		"---------------------------------------------",
		"Third Party Code Components",
		"--------------------------------------------",
		"",
	];

	for (const [nameAndVersion, info] of entries) {
		const packageName = normalizePackageName(nameAndVersion);
		const packagePath = join(process.cwd(), "node_modules", packageName);
		const licenseText = getLicenseText(packagePath);

		lines.push("=".repeat(80));
		lines.push(`Package: ${nameAndVersion}`);
		lines.push(`License: ${info.licenses ?? "UNKNOWN"}`);
		if (info.repository) {
			lines.push(`Repository: ${info.repository}`);
		}
		lines.push("-".repeat(80));
		lines.push("");
		if (licenseText.length > 0) {
			lines.push(licenseText);
		} else {
			lines.push("License text not found in package metadata.");
		}
		lines.push("");
		lines.push("");
	}

	lines.push("=".repeat(80));
	lines.push("*/");

	writeFileSync("ThirdPartyNoticeText.txt", `${lines.join("\n")}\n`, "utf8");
	process.stdout.write("Generated ThirdPartyNoticeText.txt\n");
}

main();
