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
   - `~/sync/dev/hacking/dot-agents`
   - `~/sync/dev/dot-agents`
4. Fallback to `~/dotagents`

## Commands

```bash
dotagents new <prompt|skill> [name] [--home <path>] [--force]
dotagents add [prompt|skill] <name> [--to <path>] [--home <path>] [--force]
dotagents scan [--home <path>] [--source <path> ...] [--json]
dotagents skill <skills-cli-args...>
```

## Examples

```bash
dotagents new prompt
dotagents add prompt release
dotagents add skill terminal-ui
dotagents scan --json
dotagents skill add vercel-labs/skills@find-skills
```

## Development

```bash
npm run type-check
npm run test
npm run build
```
