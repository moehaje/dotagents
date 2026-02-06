# dotagents

[![npm version](https://img.shields.io/npm/v/%40artsnlabs%2Fdotagents)](https://www.npmjs.com/package/@artsnlabs/dotagents)
[![npm downloads](https://img.shields.io/npm/dm/%40artsnlabs%2Fdotagents)](https://www.npmjs.com/package/@artsnlabs/dotagents)
[![license](https://img.shields.io/npm/l/%40artsnlabs%2Fdotagents)](LICENSE)
[![CI](https://github.com/moehaje/dotagents/actions/workflows/ci.yml/badge.svg)](https://github.com/moehaje/dotagents/actions/workflows/ci.yml)

`dotagents` is a CLI for managing agent prompts and skills from one canonical home repository.

## Features

- Create prompts and skills in a tracked home repo.
- Optionally install newly created assets to project or configured global agent paths.
- Add prompts and skills into the current project quickly.
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
dotagents add prompt release
dotagents add skill terminal-ui
dotagents scan --sync
dotagents config
dotagents skill add vercel-labs/skills@find-skills
dotagents skill sync --check
```

## Command Surface

```bash
dotagents create [prompt|skill] [name] [--home <path>] [--force]
dotagents add [prompt|skill] [name] [--to <path>] [--home <path>] [--force]
dotagents scan [--home <path>] [--source <path> ...] [--json] [--sync] [--force]
dotagents config [--home <path> --codex <path> --claude <path> --agents <path>]
dotagents skill <skills-cli-args...>
dotagents skill sync [--check] [--yes] [--home <path>]
```

If `dotagents add` is run without kind or name in interactive mode, it prompts to select the asset kind and asset(s) from home.
`dotagents new` is kept as a compatibility alias for `dotagents create`.

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
