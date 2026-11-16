# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Spec Kit scaffold and project constitution v1.0.0 (`.specify/memory/constitution.md`).
- CI workflow: format check, type check, Vitest unit tests, end-to-end UX tests, build, bundle secret check, `npm audit`.
- End-to-end UX suite (`npm run test:e2e`, `e2e/`): drives the simulator in headless Chromium through scrubbing, steering, the pointer's I-beam and tether, attention boxes, future knobs and the fan menu, and the flight-mode dialog. It is hermetic: any request off the dev server fails the test.
- `npm run check` runs every gate locally.
- Security workflows: gitleaks, dependency review, CodeQL. Dependabot for npm and GitHub Actions.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, PR and issue templates, ADRs under `docs/adr/`.
- `npm run check:speckit` guards the Spec Kit hardening in ADR 0003.

### Changed

- GitHub Pages deploy pins actions by commit SHA, uses least-privilege permissions, and publishes the verified build to https://flyinggorillaz.github.io/spaceshipUI/. Only `master` in FlyingGorillaz/spaceshipUI deploys; pull requests and forks only run checks.
- Capture scripts use Playwright's Chromium (or `CHROMIUM`) instead of a hardcoded `/snap/bin/chromium`, and share their page helpers with the e2e suite (`scripts/capture/app.mjs`).

### Security

- Spec Kit skills ask for confirmation before running a mandatory extension hook, and the spec template marks the user's description as untrusted data (ADR 0003).
