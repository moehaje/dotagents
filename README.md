# dotagents

CLI for managing agent prompts and skills from one canonical home repository.

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
npx tsx src/index.ts --help
```

## Home Repo Resolution

`dotagents` resolves the home repo in this order:

1. `--home <path>`
2. `DOTAGENTS_HOME`
3. Existing defaults:
   - `~/dotagents`
4. Fallback to `~/dotagents`

Global configuration is stored at `~/.config/dotagents/config.json` (or `$XDG_CONFIG_HOME/dotagents/config.json`).

On first run, `dotagents` bootstraps config and initializes a home repo structure (`prompts`, `skills`, `configs`, `scripts`).

## Commands

```bash
dotagents new <prompt|skill> [name] [--home <path>] [--force]
dotagents add [prompt|skill] <name> [--to <path>] [--home <path>] [--force]
dotagents scan [--home <path>] [--source <path> ...] [--json] [--sync]
dotagents config [--home <path> --codex <path> --claude <path> --agents <path>]
dotagents skill <skills-cli-args...>
dotagents skill sync [--check] [--yes]
```

## Examples

```bash
dotagents new prompt
dotagents add prompt release
dotagents add skill terminal-ui
dotagents scan --sync
dotagents config
dotagents skill add vercel-labs/skills@find-skills
dotagents skill sync --check
```

## Development

```bash
npm run type-check
npm run test
npm run build
```
