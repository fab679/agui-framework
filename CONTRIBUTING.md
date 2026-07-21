# Contributing to AGUI Framework

Thanks for contributing. Please keep pull requests focused, include tests for
behavioral changes, and update public documentation whenever the API changes.

## Local setup

```bash
npm ci
npm run verify
```

The project supports Node.js 18.18 or newer; Node 20 is used in CI.

## Before opening a pull request

```bash
npm run lint
npm run build
npm test -- --runInBand
npm pack --dry-run
```

Do not commit API keys, `.env` files, build output, coverage output, or npm
tokens. Code-execution tools must use an externally isolated runtime; do not
reintroduce in-process execution of untrusted code.

## Commit and release conventions

Use concise conventional commits where practical, for example `fix: preserve
stream cancellation` or `docs: clarify provider credentials`.

Maintainers publish only from reviewed commits that pass `npm run verify` and
`npm pack --dry-run`. Update `CHANGELOG.md` for user-visible changes.
