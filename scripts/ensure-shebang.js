import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entryPath = path.join(__dirname, "..", "dist", "index.js");

if (!fs.existsSync(entryPath)) {
	process.exit(0);
}

const shebang = "#!/usr/bin/env node";
const raw = fs.readFileSync(entryPath, "utf8");
if (raw.startsWith(shebang)) {
	fs.chmodSync(entryPath, 0o755);
	process.exit(0);
}

fs.writeFileSync(entryPath, `${shebang}\n${raw}`, "utf8");
fs.chmodSync(entryPath, 0o755);
