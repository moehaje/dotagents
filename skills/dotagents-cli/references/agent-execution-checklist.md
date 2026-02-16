# Agent Execution Checklist

Use this checklist whenever running dotagents for a user.

## 1) Clarify Intent

- Confirm the task type: create, init, add, link, edit, check, scan, config, skill sync, or lock/install/check-lock.
- Confirm asset kind: `prompt` or `skill`.
- Confirm asset id/name when required.

## 2) Choose Deterministic Inputs

- Prefer explicit flags over prompts.
- Prefer `--select`, `--all`, `--json`, `--sync-all`, `--sync-select`, `--source-only`, and `--strict` for automation.
- Avoid relying on TTY-only flows unless explicitly requested.

## 3) Choose Correct Scope

- Home default: no scope flags.
- Project: `-p`.
- Global homes: `-g`.
- Agent filter: `-a codex|claude|agents`.
- Install mode:
  - copy default: `add`
  - symlink: `link` or `add --mode symlink`

## 4) Run and Verify

- Execute the command with explicit options.
- Confirm output paths and action summaries.
- Use `dotagents scan --json` when validating synchronization outcomes.
- Use `dotagents check --json` when validating asset metadata.
- Use `dotagents skill check-lock` after lock-based installs.

## 5) Handle Failures Safely

- Missing required args: rerun with explicit `--kind`, `--name`, or positional values.
- Ambiguous targets: narrow with `-p`, `-g`, and/or a single `-a`.
- Existing destination conflicts: use `--force` only when overwrite is intended.
- For isolated scans, ensure `--source-only` is paired with at least one `--source`.
- For lock workflows, regenerate with `dotagents skill lock` if manifest changes.

## 6) Report Back Clearly

- Include what was run.
- Include what changed (paths/files).
- Include any skipped items, failures, and next exact command to retry.
