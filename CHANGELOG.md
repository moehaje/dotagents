# Changelog

All notable changes to this project will be documented in this file.

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
