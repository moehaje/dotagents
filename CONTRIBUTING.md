# Contributing

Thanks for contributing to dotagents.

## Setup

```bash
npm install
npm run build
npm run type-check
```

## Project Structure

- `src/core`: config resolution, scanning, and filesystem operations
- `src/commands`: CLI subcommands (`new`, `add`, `scan`, `config`, `skill`)
- `src/ui`: terminal branding and output helpers
- `tests`: Vitest coverage for config, assets, and registry behavior

## Guidelines

- Keep changes focused and typed.
- Prefer small modules with named exports.
- Avoid `any` and `@ts-ignore`.
- Keep CLI output consistent with existing style helpers.

## Local Checks

Run these before opening a PR:

```bash
npm run format:check
npm run lint
npm run type-check
npm run test
```
