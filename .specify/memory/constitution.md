<!--
Sync Impact Report
- Version change: 1.1.0 -> 1.1.1 (CI table clarification: deploy publishes the `dist/` that `check`
  verified instead of rebuilding, so the deployed bundle is the one the secret scan checked)
- Previous: 1.0.0 -> 1.1.0 (Principle VI and CI table: simulator end-to-end UX suite is required)
- Previous: template -> 1.0.0 (initial ratification)
- Principles added:
  I. Composition-First TypeScript
  II. Semantic, Accessible, Minimal UI
  III. Realtime Responsiveness and Cancellation
  IV. Secure by Default (NON-NEGOTIABLE)
  V. Privacy and Cost Accountability
  VI. Test-First Quality
  VII. Documentation as Code
  VIII. Continuous Integration and Delivery
  IX. Software Supply Chain Integrity
- Sections added: Technology and Security Standards, CI/CD Pipeline Requirements,
  Documentation Standards, Development Workflow and Quality Gates, Governance
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md: OK (Constitution Check gate reads this file at runtime)
  - .specify/templates/spec-template.md: OK (no principle-specific fields)
  - .specify/templates/tasks-template.md: OK (test-first ordering already supported)
- Follow-up TODOs:
  - Enable branch protection on `master` with the required checks listed below (GitHub settings,
    cannot be set from the repo).
  - Add a Content-Security-Policy to `index.html` and `extra/*.html` (Principle IV); needs a
    design pass because inline styles are used on the pages.
  - Audit `innerHTML` sinks in `src/text/pointer.ts` so no model-generated text reaches them.
-->

# Spaceship IDE Constitution

## Core Principles

### I. Composition-First TypeScript

All application code MUST be modern, strictly type-checked TypeScript that follows `AGENTS.md`.
Concrete rules:

- Each page's `main.ts` is a composition root only: it queries the DOM, creates modules, and wires
  events. State machines, algorithms, and async flows live in modules.
- One module per concern, grouped in a folder per feature and named after the concern it owns.
- Abstraction is by composition: factory functions that close over state and return a small object,
  or plain functions. Classes and inheritance are not used.
- A seam (function or small object type such as `TextSource`) is defined only where implementations
  genuinely vary, and is passed in as an argument. Simple wrappers that only rename or forward are
  forbidden; shared code is extracted on the second real use, not in anticipation.
- Code is organised from general to specific with pure functions last. Names carry meaning; comments
  appear only for non-obvious behaviour, and section-divider comments are not used.
- `tsc` MUST pass with zero errors and Prettier MUST report no differences before merge.

Rationale: A small, composable codebase is the only way to keep a realtime, speculative system
understandable enough for both humans and agents to change safely.

### II. Semantic, Accessible, Minimal UI

UI that can be known ahead of time MUST be authored as semantic HTML rather than rendered from
JavaScript. Dialogs MUST use the native `<dialog>` element. Styling MUST use modern CSS with custom
properties, nesting, grid, and flexbox; system defaults are preferred over custom CSS. The visual
language is a simple monospace font, black/white high contrast, one uniform font size, and
consistent spacing. Text and interactive controls MUST meet WCAG 2.1 AA contrast; forms and dialogs
MUST be fully keyboard operable with visible focus; decorative layers MUST be `aria-hidden`; and
pointer-only interactions MUST carry an accessible label describing the gesture. Motion MUST respect
`prefers-reduced-motion` and sound MUST stay user-toggleable and remembered.

Rationale: The interface is the research artefact. Restraint keeps attention on the interaction
ideas, and semantic HTML gives accessibility and resilience for free.

### III. Realtime Responsiveness and Cancellation

The product promise is steering ideas at interactive frame rates, so every change MUST protect it:

- Async work MUST be modelled as an `AsyncIterable` that accepts an `AbortSignal`, so simulated and
  live sources are interchangeable and cancellable.
- Any user interaction that invalidates speculative output (for example moving the main knob
  backward) MUST discard the stale cache and abort in-flight requests for it.
- Per-frame work on the main thread MUST stay within a 16 ms frame budget; layout reads and writes
  are batched, and long tasks over 50 ms during interaction are treated as bugs.
- Network calls MUST be debounced or cached by input key so that repeated or reversed gestures do
  not re-request work already known.
- Every live (LLM-backed) capability MUST have a simulated counterpart so the demo works offline and
  without keys.

Rationale: Cheap, fast generation only feels like steering when stale work is cancelled instantly
and the frame loop never stalls.

### IV. Secure by Default (NON-NEGOTIABLE)

The app runs on a public static host and handles users' own API keys. Concrete rules:

- User API keys (Cerebras, Gemini) live only in the browser's `localStorage`, are sent only in the
  `Authorization` or provider-required header to that provider's documented HTTPS endpoint, and are
  never logged, rendered, placed in URLs, or sent to any other origin.
- The developer key (`CEREBRAS_DEV_API_KEY`) lives only in the git-ignored `.env`, is read only by
  Node scripts, and MUST NEVER reach the browser bundle. Secrets MUST NOT use the `VITE_` prefix or
  be read through `import.meta.env`. CI MUST fail if a built `dist/` contains key material.
- Model output, pasted text, and any other untrusted string MUST be inserted with `textContent` or
  equivalent safe APIs, never `innerHTML`, `insertAdjacentHTML`, or `document.write`. Markup strings
  passed to `innerHTML` MAY only be built from constants and numeric values computed in code.
- `eval`, `new Function`, string-based `setTimeout`/`setInterval`, and remote script includes are
  forbidden. Network calls MUST target an explicit allowlist of HTTPS provider endpoints declared
  as module constants.
- Pages SHOULD ship a Content-Security-Policy restricting `script-src` to self and `connect-src` to
  the provider allowlist.
- Secret scanning, CodeQL, and dependency vulnerability audit MUST run in CI and block merge on
  findings. Known vulnerabilities are remediated within: critical 7 days, high 30 days, medium 90
  days. Vulnerabilities are reported privately per `SECURITY.md`.

Rationale: A bring-your-own-key demo is only trustworthy if keys and user text cannot leak through
the bundle, the DOM, or a third-party origin.

### V. Privacy and Cost Accountability

The app MUST NOT include analytics, telemetry, or third-party trackers. User text is sent only to the
LLM provider the user explicitly enables in live mode, and only what the feature needs. Every script
call made with the developer key MUST go through `chat` in `scripts/cerebras-dev.mjs` so its token
usage is recorded in the git-ignored `token-usage.log`. New scripts that spend tokens MUST report
usage the same way.

Rationale: Users and maintainers must always know where their text goes and what it costs.

### VI. Test-First Quality

Behaviour changes MUST be driven by tests: write a failing test, implement the minimum code, then
refactor. Concrete rules:

- Pure logic (geometry, text segmentation, layout, caching, stream parsing) MUST have Vitest unit
  tests colocated as `*.test.ts` next to the module.
- Live sources are tested through their seams with a stubbed `fetch`; tests MUST be hermetic: no
  real network, no real API keys, no reliance on wall-clock timing.
- Every bug fix MUST include a regression test that fails without the fix.
- Interaction-heavy UI (main knob scrubbing and steering, the pointer, attention boxes, future
  knobs and the fan menu, flight-mode dialog) MUST be covered by the end-to-end suite in `e2e/`:
  `playwright-core` driving the simulator (sim mode, no network, no keys) through human-paced
  gestures from `scripts/capture/hand.mjs`, asserting on DOM state, ARIA labels, CSS highlights and
  the status line. A new gesture or interaction MUST add an e2e test; a test that fails without
  the change is the regression test for UI bugs.
- What the suite cannot judge (look and feel, motion, sound) MUST be checked manually against the
  simulator before merge, and the PR MUST say what was checked.
- `npm test` (unit) and `npm run test:e2e` MUST pass with zero failures locally and in CI.

Rationale: The speculative cache and cancellation logic is subtle; tests are the only durable record
of the judgement calls behind it.

### VII. Documentation as Code

Documentation is versioned and reviewed with the code it describes; a change is not done until its
documentation is. Any user-visible change MUST update `README.md` (and demo clips when the
interaction changes) and add an entry under `Unreleased` in `CHANGELOG.md`. Significant decisions
(new dependency, new provider, new interaction paradigm, security trade-off) MUST be recorded as an
ADR in `docs/adr/NNNN-title.md`. Changes to coding conventions MUST update `AGENTS.md`. Exported
functions and types SHOULD carry a one-line JSDoc describing intent when the name alone is not
enough.

Rationale: This is a research prototype that others cite and build on; its reasoning must survive
beyond the code.

### VIII. Continuous Integration and Delivery

Every push and pull request MUST run the pipeline defined in "CI/CD Pipeline Requirements".
`master` MUST always be deployable, and GitHub Pages MUST be deployed only by the workflow after
the same checks pass, never from a developer machine. A red `master` is a stop-the-line event: the
next merge MUST be the fix or a revert. Workflow files are code and follow the same review and
security rules as `src/`.

Rationale: Automated, repeatable pipelines are the only reliable way to enforce the other principles
on every change.

### IX. Software Supply Chain Integrity

Every dependency and build input MUST be traceable and verifiable:

- Dependencies are declared in `package.json` and resolved in the committed `package-lock.json`;
  CI installs with `npm ci`.
- New packages MUST have been published for at least seven days, carry an OSI-approved licence
  compatible with MIT, be actively maintained, and be justified in the PR. Runtime dependencies are
  kept to the minimum; prefer the platform.
- Third-party GitHub Actions MUST be pinned to a full commit SHA with the version in a comment.
- Workflows MUST declare least-privilege `permissions:` (default `contents: read`); write scopes are
  granted per job only where required (for example Pages deploy).
- Dependabot MUST be enabled for npm and GitHub Actions, and its PRs pass the full pipeline before
  merge. `npm audit` gates at high severity and MUST NOT be loosened to make a build pass.

Rationale: Static sites are compromised through their build chain; pinning, review, and least
privilege close those doors cheaply.

## Technology and Security Standards

- Runtime: evergreen browsers (Chromium, Firefox, Safari latest two versions). Build: Vite.
  Language: TypeScript with `noUnusedLocals`, `noUnusedParameters`, and `erasableSyntaxOnly`.
- Node.js for tooling is pinned in `.nvmrc`; CI uses the same version.
- Formatting: Prettier with the committed `.prettierrc`; `npm run format` runs before every commit.
- Testing: Vitest, with a `unit` project (`src/**/*.test.ts`) and an `e2e` project (`e2e/*.test.mjs`)
  that serves the simulator and drives it with `playwright-core`. Demo capture scripts in `scripts/`
  share the same page helpers (`scripts/capture/app.mjs`, `hand.mjs`).
- LLM providers: Cerebras chat completions and Gemini, called directly from the browser with the
  user's key. Adding a provider requires an ADR and an update to the endpoint allowlist.
- `.env` and `token-usage.log` stay git-ignored; `.env.example` lists every variable with a
  placeholder value only.

## CI/CD Pipeline Requirements

GitHub Actions MUST implement these stages. Each job marked required is a required status check on
`master`.

| Workflow / job                 | Trigger                    | MUST include                                                                                                                       | Required |
| ------------------------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `Check and deploy / check`     | push, pull_request         | `npm ci`, Prettier check, `tsc`, `npm test`, `npm run test:e2e`, `vite build`, bundle secret check, `npm audit --audit-level=high` | yes      |
| `security / gitleaks`          | push, pull_request         | secret scan of the diff/history                                                                                                    | yes      |
| `security / dependency-review` | pull_request               | block new high-severity or incompatible-licence deps                                                                               | yes      |
| CodeQL (GitHub default setup)  | push, pull_request, weekly | CodeQL for JavaScript/TypeScript and Actions                                                                                       | yes      |
| `Check and deploy / deploy`    | push to `master`           | after `check`, only on `master` in `FlyingGorillaz/spaceshipUI`: deploy the `dist/` that `check` built and scanned to GitHub Pages | n/a      |

Pipeline rules:

- Every job MUST set `timeout-minutes`, and workflows use `concurrency` to cancel superseded runs.
- Caches are keyed on the lock file; CI MUST NOT rely on mutable state between runs.
- Secrets are GitHub encrypted secrets or OIDC credentials, scoped to the job that needs them, and
  never echoed to logs. Workflows triggered from forks never receive secrets.
- Failing checks MUST NOT be bypassed with `continue-on-error`, `--no-verify`, or admin merges;
  flaky tests are fixed or quarantined with a tracking issue within one working day.

## Documentation Standards

The repository MUST maintain these documents, each kept current by the change that affects it:

- `README.md`: the conjecture, demos, how to run locally, how to go live with keys, citation.
- `AGENTS.md`: coding conventions for humans and agents (authoritative for style).
- `CONTRIBUTING.md`: setup, Spec Kit workflow, test-first expectations, commit and PR conventions.
- `SECURITY.md`: supported versions, key-handling model, and private vulnerability reporting.
- `CHANGELOG.md`: Keep a Changelog format with an `Unreleased` section.
- `docs/adr/`: numbered Architecture Decision Records (context, decision, consequences).
- `specs/NNN-feature/`: Spec Kit artefacts for each feature, updated when implementation diverges.

## Development Workflow and Quality Gates

- Work is spec-driven: each non-trivial feature has a `spec.md` before implementation and a
  `plan.md`/`tasks.md` from the Spec Kit workflow; every `plan.md` passes the Constitution Check
  against all principles before tasks are generated.
- Changes are made on branches and merged through pull requests; direct and force pushes to
  `master` are blocked by branch protection.
- Each PR needs an approving review from a code owner, all required checks green, and resolved
  conversations. Changes to `.github/`, `src/llm/`, key handling, or this constitution require
  code-owner review.
- Commits follow Conventional Commits (`feat:`, `fix:`, `docs:`, `ci:`, `chore:`) and SHOULD be
  signed.
- PRs use the repository PR template, including its constitution checklist.

## Governance

This Constitution is the source of truth for project standards and supersedes ad-hoc practices;
`AGENTS.md` holds the detailed style rules it references. Any MUST is non-negotiable; SHOULD items
are strongly recommended and need a justification in the PR to override.

- **Amendments**: a PR that edits this file, updates the Sync Impact Report, bumps the version, and
  updates dependent artefacts (`AGENTS.md`, `specs/`, README) in the same change.
- **Versioning**: MAJOR for removing or redefining a principle, MINOR for adding a principle or
  materially expanding guidance, PATCH for clarifications and wording.
- **Exceptions**: a temporary deviation from a MUST needs a tracking issue naming the principle, the
  risk, an owner, and an expiry no more than 90 days out, referenced where the code deviates.
- **Compliance**: enforced by CI, the PR template checklist, and code-owner review.
  `/speckit-analyze` treats constitution conflicts as CRITICAL findings.
- **Review cadence**: the constitution, dependencies, and open exceptions are reviewed at least
  quarterly.

**Version**: 1.1.1 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-17
