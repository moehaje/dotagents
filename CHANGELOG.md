# Changelog

All notable changes to this project will be documented in this file.

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
