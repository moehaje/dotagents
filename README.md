# dotagents

[![npm version](https://img.shields.io/npm/v/%40artsnlabs%2Fdotagents)](https://www.npmjs.com/package/@artsnlabs/dotagents)
[![npm downloads](https://img.shields.io/npm/dm/%40artsnlabs%2Fdotagents)](https://www.npmjs.com/package/@artsnlabs/dotagents)
[![license](https://img.shields.io/npm/l/%40artsnlabs%2Fdotagents)](LICENSE)
[![CI](https://github.com/moehaje/dotagents/actions/workflows/ci.yml/badge.svg)](https://github.com/moehaje/dotagents/actions/workflows/ci.yml)

`dotagents` is a unified CLI for managing agent assets (prompts, skills, configs) from one home source across projects, local agents, and sync workflows.

## Features

- Create prompts and skills in a tracked home repo.
- Bootstrap project-local `.agents` directories and starter docs.
- Optionally install newly created assets to project or configured global agent paths.
- Add prompts and skills into the current project quickly.
- Link prompts and skills from home into project/global targets via symlinks.
- Validate prompt and skill assets before sync/install workflows.
- Scan agent directories to find unsynced assets.
- Sync skills using a registry-driven workflow.
- Delegate skill package operations to the upstream `skills` CLI.

## Requirements

- Node.js 18+
- npm
- `npx skills` available for `dotagents skill ...` passthrough and sync flows

## Install

```bash
npm i -g @artsnlabs/dotagents
```

Homebrew (tap):

```bash
brew tap moehaje/tap
brew install dotagents
```

Homebrew one-command install:

```bash
brew install moehaje/tap/dotagents
```

Without global install:

```bash
npx @artsnlabs/dotagents --help
```

## Usage

```bash
dotagents --help
dotagents create prompt
dotagents init -p
dotagents add prompt release
dotagents add prompt release --mode symlink
dotagents link prompt release
dotagents edit prompt release
dotagents check --strict
dotagents add skill terminal-ui
dotagents scan --sync
dotagents config
dotagents skill add vercel-labs/skills@find-skills
dotagents skill sync --check
dotagents skill lock
dotagents skill install
dotagents skill check-lock
```

## Command Surface

```bash
dotagents create [prompt|skill] [name] [--kind <prompt|skill>] [--name <slug>] [--title <title>] [--description <text>] [--args <text>] [--content <text>|--content-file <path>|--content-stdin] [--home <path>] [--project|-p] [--global|-g] [--agent|-a <name>] [--force]
dotagents init [--project|-p] [--with <prompt:name,skill:name,...>] [--link] [--home <path>] [--force]
dotagents add [prompt|skill] [name] [--to <path>] [--agent|-a <codex|claude|agents>] [--all|--select <name,...>] [--mode <copy|symlink>] [--home <path>] [--force]
dotagents link [prompt|skill] [name] [--kind <prompt|skill>] [--name <slug>] [--to <path>] [--agent|-a <codex|claude|agents>] [--all|--select <name,...>] [--home <path>] [--force]
dotagents edit [prompt|skill] [name] [--kind <prompt|skill>] [--name <slug>] [--file <relative/path>] [--inline] [--editor <cmd>] [--home <path>] [--project|-p] [--global|-g] [--agent|-a <name>]
dotagents check [prompt|skill] [--home <path>] [--json] [--strict] [--filter <name,...>] [--exclude <name,...>]
dotagents scan [--home <path>] [--source <path> ...] [--source-only] [--json] [--diff|--diff-full|--explain-conflicts] [--sync|--sync-all|--sync-select <kind:id:path,...>] [--force]
dotagents config [--home <path> --editor <cmd> --codex <path> --claude <path> --agents <path>]
dotagents skill <skills-cli-args...>
dotagents skill sync [--check] [--yes] [--home <path>]
dotagents skill lock [--manifest <path>] [--lockfile <path>]
dotagents skill install [--manifest <path>] [--lockfile <path>]
dotagents skill check-lock [--lockfile <path>]
```

If `dotagents add` is run without kind or name in interactive mode, it prompts to select the asset kind and asset(s) from home.
`dotagents new` is kept as a compatibility alias for `dotagents create`.
Use `dotagents init` to scaffold `.agents/prompts`, `.agents/skills`, and starter docs in the current project.
Pass `--with prompt:<name>,skill:<name>` to install starter assets during init, and add `--link` to symlink instead of copying.
Use `dotagents link` for dedicated symlink flows, or `dotagents add --mode symlink` for add-command parity.
Use create target flags to control where assets are written: `-p` (project), `-g` (global agent homes), `-a codex|claude|agents`.
Combine `-p` and `-a` to target agent-local project directories (for example `./.codex` or `./.claude`).
`dotagents edit` uses the same scope flags and defaults to home scope when no target flags are provided.
`dotagents edit skill` defaults to `SKILL.md`; pass `--file <relative/path>` to edit another file in the skill directory.
If `dotagents edit` runs without `<name>` in interactive mode, it shows a picker of assets found in the selected scope.
Use `--inline` for in-terminal full-content replacement mode (or fallback when no editor can be launched).
Use `dotagents check` as a quality gate for prompt/skill frontmatter; add `--strict` to fail on warnings, `--json` for CI parsing, `--filter` to check exact asset ids/names, and `--exclude` to skip exact assets.
Use `dotagents add --all` or `dotagents add --select ...` to avoid interactive pickers when omitting `<name>`.
Use `dotagents scan --source <path> --source-only` when you need isolated scans without default/global agent directories.
Use `dotagents scan --diff` or `dotagents scan --diff-full` to review conflict summaries before syncing; add `--explain-conflicts` for explicit reason/recommendation output.
Use `dotagents scan --sync-all` or `dotagents scan --sync-select ...` for non-interactive sync runs.
Use `dotagents skill lock` to resolve `agents.toml` into a deterministic `agents.lock.toml`.
Use `dotagents skill install` to install pinned lockfile skills into project-local `.agents/skills/<id>`.
Use `dotagents skill check-lock` in CI to verify installed skills match lockfile integrity.

### Skill Manifest and Lock

Create `agents.toml` in your project root:

```toml
[project]
name = "my-project"

[[skills]]
id = "find-skills"
source = "vercel-labs/skills@find-skills"
```

Generate lock and install:

```bash
dotagents skill lock
dotagents skill install
dotagents skill check-lock
```

## Home Repo Resolution

`dotagents` resolves the home repo in this order:

1. `--home <path>`
2. `DOTAGENTS_HOME`
3. Global config (`~/.config/dotagents/config.json`, or `$XDG_CONFIG_HOME/dotagents/config.json`)
4. Filesystem auto-detection for `dotagents` / `dot-agents`
5. Fallback to `~/dotagents`

On first run, `dotagents` bootstraps global config and initializes a home layout with:
- `prompts/`
- `skills/`
- `configs/skills-registry.tsv`
- `scripts/`

## Project Health

- [CI workflow](.github/workflows/ci.yml)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)
- [Versioning policy](VERSIONING.md)
- [Third-party notices](ThirdPartyNoticeText.txt)

## Development

```bash
npm install
npm run format:check
npm run lint
npm run type-check
npm run test
npm run build
```

## License

MIT
