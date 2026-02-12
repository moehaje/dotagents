# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Add `dotagents check` command with prompt/skill metadata validation, `--json` machine output, kind filtering (`prompt|skill`), and `--strict` warning-as-error mode for CI gating.

## [0.4.0] - 2026-02-10

### Added

- Add create target flags for project/global/agent destinations (`-p`, `-g`, `-a`) and agent-specific project-local targeting.
- Add non-interactive create flags for prompt metadata and content input.
- Add add-command agent targeting with `--agent/-a` for configured global homes.
- Add scan sync automation flags (`--sync-all`, `--sync-select`) for non-interactive workflows.
- Add `dotagents edit` command for editing prompts/skills across home, project, and global scopes with `-p/-g/-a` targeting.
- Add `--file` support for skill-local edits and `--inline` terminal edit mode with atomic file writes.
- Add editor resolution/runtime utilities with precedence for CLI override, config, env vars, git config, and PATH fallbacks.
- Add focused tests for edit command flows, shared target resolution, and editor resolution.

### Changed

- Include current project path as a default scan source and deduplicate overlapping source roots.
- Refactor create target resolution into shared core utilities reused by both `create` and `edit`.
- Extend global config to persist optional editor command (`dotagents config --editor <cmd>`).
- Standardize command help formatting for create/add/scan/edit/config with structured sections and examples.
- Update CLI help and README command surface to include `dotagents edit` and scope-aware interactive selection behavior.

### Fixed

- Fix create targeting so `-p` combined with `-a` resolves to project-local agent directories.
## [0.3.1] - 2026-02-07

### Fixed

- Fix CLI version reporting so `dotagents -v` always returns dotagents' own version instead of using the current working directory's `package.json`.

## [0.3.0] - 2026-02-06

### Added

- Add `dotagents create` as the primary asset creation command while keeping `dotagents new` as a compatible alias.
- Add interactive post-create install flow to place newly created prompts/skills into project and global agent destinations.
- Expand scan source coverage across more agent tooling locations.
- Add richer scan status buckets for synced/git-tracked, synced/untracked, and unsynced assets.

### Changed

- Improve default scan source output with summarized active/configured counts.
- Update public package metadata and README positioning to emphasize dotagents as a unified management CLI.

### Fixed

- Fix create/install output clarity by removing duplicated destination path rendering.
- Fix `dotagents new` UX by prompting for asset kind when omitted.

## [0.2.0] - 2026-02-05

### Added

- Add Homebrew installation documentation and one-command tap install instructions.
- Add release automation jobs to update `moehaje/homebrew-tap` formula on release publish and manual dispatch.
- Add `scripts/homebrew-metadata.ts` and `npm run release:homebrew-metadata` to resolve npm tarball metadata and formula content.
- Add generated `ThirdPartyNoticeText.txt` as part of packaged release artifacts.

### Changed

- Migrate maintenance scripts from JavaScript to TypeScript (`ensure-shebang`, `generate-licenses`, `homebrew-metadata`).
- Update build/release script commands to run script tooling via `tsx`.
- Improve public package guidance in README for global install and project health links.

## [0.1.0] - 2026-02-05

### Added

- Scaffold a TypeScript ESM CLI package with executable `dotagents` binary and build pipeline.
- Add core command surface:
  - `dotagents new <prompt|skill>`
  - `dotagents add [prompt|skill] <name>`
  - `dotagents scan`
  - `dotagents config`
  - `dotagents skill <args...>`
- Add first-run bootstrap with persisted global config at `~/.config/dotagents/config.json`.
- Add home-repo auto-detection filesystem discovery of `dotagents`/`dot-agents`.
- Add home repository initialization with standard layout:
  - `prompts/`
  - `skills/`
  - `configs/skills-registry.tsv`
  - `scripts/`
- Add interactive prompt creation workflow:
  - slug/title/description/args capture
  - multiline markdown content input mode (EOF-terminated)
  - `--content-file` and `--content-stdin` for non-interactive content ingestion
- Add skill template generation via `dotagents new skill`.
- Add asset scanning and drift detection across configured agent homes (Codex, Claude, `.agents`, and custom sources).
- Add interactive multi-select sync from scan results to import unsynced prompts and skills into home.
- Add skill registry operations and `dotagents skill sync` flow for checking/updating tracked skills.
- Add passthrough support to upstream skills CLI via `dotagents skill ...`.
- Add interactive add flow when name is omitted, including kind selection and asset picker from home.
