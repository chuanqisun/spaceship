# Contributing

The project rules are in the [constitution](.specify/memory/constitution.md). Coding style is in [AGENTS.md](AGENTS.md).

## Setup

```sh
nvm use            # Node version from .nvmrc
npm ci
npm run dev        # simulator at http://localhost:5173/spaceship/
```

Optional: copy `.env.example` to `.env` to prototype prompts with `scripts/cerebras-dev.mjs`. Never commit `.env`.

## Workflow

1. For a non-trivial feature, run the Spec Kit flow first: `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, then `/speckit-implement`. This creates `specs/NNN-feature/`.
2. Work on a branch. Write a failing test first (`src/**/name.test.ts`), make it pass, then refactor.
3. Before you push, run:

   ```sh
   npm run format
   npm run typecheck
   npm test
   npm run build && npm run check:bundle
   ```

4. Update `README.md`, `CHANGELOG.md` (under `Unreleased`) and `AGENTS.md` when they are affected. Record significant decisions in `docs/adr/`.
5. Open a pull request using the template. All required checks must pass and a code owner must approve.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`.

## Dependencies

New packages must have been published for at least 7 days. They must have an MIT-compatible OSI licence. Justify each one in the PR. Prefer platform APIs over new runtime dependencies.
