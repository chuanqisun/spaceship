# 0002. Spec-driven development and CI quality gates

- Status: Accepted
- Date: 2026-11-17

## Context

The project grew through fast, AI-assisted iteration. It had no tests, no CI checks before deploy, and no written standards beyond `AGENTS.md`.

## Decision

Adopt GitHub Spec Kit with a project constitution. Add Vitest, and run these CI gates on every push and pull request: format, type check, tests, build, bundle secret check, `npm audit`, gitleaks, dependency review and CodeQL. Pin actions by SHA and use least-privilege permissions. The Pages deploy re-runs verification before it publishes.

Vitest is the test runner because it reuses the Vite config and TypeScript transform the app already has, so tests need no second build toolchain. Node 24 LTS is pinned in `.nvmrc` so local runs and CI use the same runtime. Vite 8 and Vitest 5 also support Node 22.12+, so contributors on 22 are not blocked.

## Consequences

- Each change needs a passing pipeline. Dependabot PRs add steady but small review work.
- The constitution is the single place to change standards, with a versioned amendment process.
