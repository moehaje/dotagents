# Troubleshooting

## `dotagents: command not found`

Run using npx:

```bash
npx @artsnlabs/dotagents --help
```

Or install globally:

```bash
npm i -g @artsnlabs/dotagents
```

## Missing value / unknown option errors

Cause: required flag value omitted or unsupported flag used.

Fix:
- Run `dotagents <command> --help`.
- Re-run with explicit values for each flag that requires one.

## Invalid agent target(s)

Cause: `-a/--agent` must be one of `codex`, `claude`, or `agents`.

Fix:

```bash
dotagents add prompt release -a codex
```

## Multiple edit targets resolved

Cause: broad scope flags resolved more than one target in non-interactive mode.

Fix:
- Narrow scope with fewer flags, or
- Run interactively to choose one target.

Examples:

```bash
dotagents edit prompt release -g -a codex
dotagents edit prompt release -p -a codex
```

## `dotagents scan --source-only` fails

Cause: `--source-only` requires one or more explicit `--source` values.

Fix:

```bash
dotagents scan --source ./.tmp/srcA --source-only
```

## Scan reports conflict states

Cause: discovered assets and home assets differ, are untracked, or multiple sources provide divergent content.

Fix:
- Review summaries: `dotagents scan --diff`
- Review detailed previews: `dotagents scan --diff-full`
- Print reasons/recommendations: `dotagents scan --explain-conflicts`
- Sync intentionally with explicit keys: `dotagents scan --sync-select kind:id:path`

## Target already exists

Cause: destination file/dir already exists.

Fix:
- Re-run with `--force` only if overwrite is intended.

## `dotagents check` reports validation failures

Cause: malformed prompt/skill frontmatter, missing required metadata, or missing `SKILL.md`.

Fix:
- Run `dotagents check --json` to inspect exact issue codes and paths.
- Ensure prompt files start with frontmatter and include `description`.
- Ensure each skill directory contains `SKILL.md` with `name` and `description`.
- Use `dotagents check --strict` in CI only when warnings should fail builds.

## Skill sync issues (`dotagents skill sync`)

Cause: missing/invalid registry entries or `npx skills` failure.

Fix:
- Check registry file at `<home>/configs/skills-registry.tsv`.
- Run check mode first:

```bash
dotagents skill sync --check
```

- Then sync explicitly:

```bash
dotagents skill sync --yes
```

## Lock workflow errors (`dotagents skill lock|install|check-lock`)

Cause:
- malformed `agents.toml` / `agents.lock.toml`
- missing lockfile entries
- integrity mismatches for installed skills

Fix:
- Validate manifest structure (`[[skills]]`, each with `id` + `source`).
- Regenerate lockfile:

```bash
dotagents skill lock
```

- Reinstall pinned skills:

```bash
dotagents skill install
```

- Re-check integrity:

```bash
dotagents skill check-lock
```

## Home path confusion

Inspect effective config:

```bash
dotagents config --list
```

Set home explicitly when needed:

```bash
dotagents config --home ~/dotagents
```
