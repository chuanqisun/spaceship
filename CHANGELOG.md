# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- Spec Kit scaffold and project constitution v1.0.0 (`.specify/memory/constitution.md`).
- CI workflow: format check, type check, Vitest unit tests, build, bundle secret check, `npm audit`.
- Security workflows: gitleaks, dependency review, CodeQL. Dependabot for npm and GitHub Actions.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, PR and issue templates, ADRs under `docs/adr/`.

### Changed

- GitHub Pages deploy pins actions by commit SHA, uses least-privilege permissions, and verifies before deploying.
