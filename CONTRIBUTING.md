# Contributing

The project rules are in the [constitution](.specify/memory/constitution.md). Coding style is in [AGENTS.md](AGENTS.md).

## Setup

```sh
nvm use            # Node version from .nvmrc
npm ci
npx playwright-core install chromium   # once, for the end-to-end UX suite
npm run dev        # simulator at http://localhost:5173/spaceshipUI/
```

Optional: copy `.env.example` to `.env` to prototype prompts with `scripts/cerebras-dev.mjs`. Never commit `.env`.

## Workflow

1. For a non-trivial feature, run the Spec Kit flow first: `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, then `/speckit-implement`. This creates `specs/NNN-feature/`.
2. Work on a branch. Write a failing test first, make it pass, then refactor: a unit test colocated as `src/**/name.test.ts` for logic, or an end-to-end test in `e2e/` for a gesture or interaction. E2E tests drive the simulator with `createHand` and `appOf` from `scripts/capture/`, and assert on DOM state, ARIA labels, CSS highlights and the status line.
3. Before you push, run `npm run format`, then `npm run check`. CI runs the same `check` script: Prettier check, type check, unit tests, the end-to-end UX suite, build and the bundle secret check.

4. Update `README.md`, `CHANGELOG.md` (under `Unreleased`) and `AGENTS.md` when they are affected. Record significant decisions in `docs/adr/`.
5. Open a pull request using the template. All required checks must pass and a code owner must approve.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`.

## Dependencies

New packages must have been published for at least 7 days. They must have an MIT-compatible OSI licence. Justify each one in the PR. Prefer platform APIs over new runtime dependencies.
