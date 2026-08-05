# Development Process

This project follows a strict one-module-at-a-time workflow.

## Required Gate

After each module:

1. Build the project.
2. Run TypeScript check.
3. Run lint.
4. Fix all errors.
5. Run tests.
6. Fix all errors.
7. Continue only when everything is green.

## Commands

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

On Windows PowerShell:

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
```

## CI

GitHub Actions runs the same gate on:

- Push to `main`
- Pull requests to `main`
- Manual workflow dispatch

The workflow is defined in:

```text
.github/workflows/ci.yml
```

## Specification Rule

Do not implement unspecified features.

If a rule, format, workflow, or edge case is missing from the specification, stop and ask before implementing it.
