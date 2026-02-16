---
name: dotagents-cli
description: Operate the dotagents CLI to create, init, add, link, edit, check, scan, and lock/install skills across project and global agent homes. Use when users ask to manage prompt/skill assets with dotagents, automate non-interactive CLI workflows, configure dotagents paths, review scan conflicts, or troubleshoot dotagents command behavior.
---

# Dotagents CLI

## Overview

Use `dotagents` to manage prompt and skill assets without manually copying files between home repos and agent directories.
Prefer deterministic, flag-driven commands so coding agents can run reliably in scripts and non-interactive environments.

## Operating Workflow

1. Confirm runtime and command availability.
- Run `dotagents --version`.
- If not installed globally, run via `npx @artsnlabs/dotagents`.

2. Identify user intent.
- Create new asset: use `dotagents create`.
- Scaffold local project structure: use `dotagents init`.
- Copy home asset into project/global target: use `dotagents add`.
- Symlink home asset into project/global target: use `dotagents link` or `dotagents add --mode symlink`.
- Modify an existing asset: use `dotagents edit`.
- Validate home assets: use `dotagents check`.
- Discover drift/conflicts between home and agent locations: use `dotagents scan`.
- Configure home/agent paths: use `dotagents config`.
- Sync registry-managed skills from home: use `dotagents skill sync`.
- Pin project skills from manifest lockfiles: use `dotagents skill lock`, `dotagents skill install`, `dotagents skill check-lock`.

3. Choose target scope before execution.
- Home scope (default): no scope flags.
- Project scope: `-p`.
- Global agent homes: `-g`.
- Specific agent: `-a codex|claude|agents`.
- Combine `-p` with `-a` to target project-local agent folders like `./.codex`.

4. Prefer non-interactive command forms.
- Supply names and flags explicitly.
- Use batch-friendly flags (`--all`, `--select`, `--json`, `--sync-all`, `--sync-select`, `--source-only`, `--strict`).
- Use interactive prompts only when the user explicitly wants guided selection.

5. Verify results.
- Check output paths printed by dotagents.
- Re-run `dotagents scan --json` when validating sync state.

## Agent Rules

- Default to non-interactive execution for repeatability.
- Keep `--help` output and command behavior aligned when advising users.
- Do not assume one fixed home path; inspect with `dotagents config --list` when needed.
- Surface actionable failures and retry guidance when flags are missing or targets are ambiguous.
- Use `--force` only when overwrite is explicitly intended.
- For CI or machine parsing, prefer JSON-capable flags (`check --json`, `scan --json`) and treat non-zero exits as gate failures.

## Execution Defaults

Use these patterns in automation or scripted flows:

```bash
# Create a prompt in home with explicit content file
dotagents create prompt release --name release --content-file ./release.md

# Add a known skill to project-local .agents
dotagents add skill terminal-ui

# Add selected prompts to codex + claude global homes
dotagents add prompt --select release,triage -a codex,claude

# Add as symlink instead of copy
dotagents add prompt release --mode symlink

# Scaffold project .agents and seed starter assets
dotagents init -p --with prompt:release,skill:terminal-ui --link

# Dedicated link command for global agent target
dotagents link skill terminal-ui -a codex

# Edit a skill helper file in project codex scope
dotagents edit skill terminal-ui -p -a codex --file references/checklist.md --editor "code --wait"

# Review drift before syncing
dotagents scan --source ./.tmp/sourceA --source-only --diff

# Scan and sync specific unsynced assets
dotagents scan --sync-select prompt:release:/abs/path/release.md

# Validate only skills and fail on warnings
dotagents check skill --strict --json

# Resolve and install pinned project skills
dotagents skill lock
dotagents skill install
dotagents skill check-lock
```

## References

- [Command Surface](references/command-surface.md)
- [Agent Execution Checklist](references/agent-execution-checklist.md)
- [Troubleshooting](references/troubleshooting.md)
