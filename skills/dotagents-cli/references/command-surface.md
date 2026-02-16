# Command Surface

Use this quick map to select the right command.

## Core Commands

- `dotagents create [prompt|skill] [name] [options]`
- `dotagents init [options]`
- `dotagents add [prompt|skill] [name] [options]`
- `dotagents link [prompt|skill] [name] [options]`
- `dotagents edit [prompt|skill] [name] [options]`
- `dotagents check [prompt|skill] [options]`
- `dotagents scan [options]`
- `dotagents config [options]`
- `dotagents skill <skills-cli-args...>`
- `dotagents skill sync [--check] [--yes] [--home <path>]`
- `dotagents skill lock [--manifest <path>] [--lockfile <path>]`
- `dotagents skill install [--manifest <path>] [--lockfile <path>]`
- `dotagents skill check-lock [--lockfile <path>]`

Compatibility alias:
- `dotagents new` (alias for `create`)

## Best Flags for Non-Interactive Agents

### `create`

- `--kind <prompt|skill>`
- `--name <slug>`
- `--title <title>`
- `--description <text>`
- `--content <text>`
- `--content-file <path>`
- `--content-stdin`
- `-p|--project`
- `-g|--global`
- `-a|--agent <codex|claude|agents>`
- `-f|--force`

### `init`

- `-p|--project`
- `--with <prompt:name,skill:name,...>`
- `--link`
- `--home <path>`
- `-f|--force`

### `add`

- `--all`
- `--select <name,...>`
- `--to <path>`
- `--mode <copy|symlink>`
- `-a|--agent <codex|claude|agents>`
- `--home <path>`
- `-f|--force`

### `link`

- `--kind <prompt|skill>`
- `--name <slug>`
- `--to <path>`
- `--all`
- `--select <name,...>`
- `-a|--agent <codex|claude|agents>`
- `--home <path>`
- `-f|--force`

### `edit`

- `--kind <prompt|skill>`
- `--name <slug>`
- `--file <relative/path>` (skills only)
- `--editor <cmd>`
- `--inline`
- `-p|--project`
- `-g|--global`
- `-a|--agent <codex|claude|agents>`

### `scan`

- `--json`
- `--source <path>`
- `--source-only` (requires at least one `--source`)
- `--sync`
- `--sync-all`
- `--sync-select <kind:id:path,...>`
- `--diff`
- `--diff-full`
- `--explain-conflicts`
- `--sources-full`
- `-f|--force`

### `check`

- `--home <path>`
- `--json`
- `--strict`
- `--filter <name,...>`
- `--exclude <name,...>`

### `config`

- `--home <path>`
- `--editor <cmd>`
- `--codex <path>`
- `--claude <path>`
- `--agents <path>`
- `--source <path>`
- `--clear-sources`
- `--list|--json`

## Scope Semantics

- Default (no scope flags): home repo scope.
- `-p`: project scope (`./.agents` unless paired with `-a`).
- `-g`: configured global agent homes.
- `-a codex|claude|agents`: filter scope to specific agents.
- `-p -a codex` targets project-local `./.codex`.

## Exit Codes

- `0`: success
- `1`: runtime failure
- `2`: usage or validation failure
- `130`: canceled interactive flow

## Machine Output Notes

- `dotagents check --json` and `dotagents scan --json` are suitable for CI parsing.
- When `--json` is present, CLI banner output is suppressed to keep payloads parseable.
