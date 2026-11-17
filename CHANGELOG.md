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
- Usability remediation (`specs/001-usability-remediation/`): auto-reveal and first-use hint on load, idle attract animation, gesture legend dialog (`h`/`?` or tray `?`), plain-language hover labels, ghost text ahead of the caret, press-pull steering-zone cue, pin-provenance flash, `↩ restore` chip for scrub-back discards, forgiving dead-zone knob release, `⌥`-select for attention boxes, arrow-key word nudge, `Enter` attention toggle, persisted sound preference, session restore across reloads, `prefers-reduced-motion` support, touch input without the cursor layer, and a two-step `flight?` mode toggle.
- Unit tests for the text stream (`restore`/`truncate`/expanded opening) and session persistence validation; e2e coverage for the new interactions in `e2e/usability.test.mjs`.
- ADR 0004 records the forgiving-gesture and affordance decisions.
- Mobile responsive UX (`specs/002-mobile-responsive/`): viewport meta, narrow-layout collapse of the rail and side gutters, compacting tray, fingertip-sized knobs and tray targets on coarse pointers, touch gesture mappings (tap expand and HUD/keyword readouts, single-press hold to spawn future knobs, ~0.5 s hold to delete boxes and knobs, press-drag steering in the ahead zone with native vertical scrolling preserved, selection→attention box via the floating "box" action or the ⊞ side button, on-screen nudge/expand/box controls), touch-visible zone cue, scoped callout/context-menu suppression, and touch rows in the gesture legend. ADR 0005 records the gesture mapping and `touch-action` arbitration.
- Parallel model comparison (`specs/003-parallel-inference/`): a new `arena.html` page runs up to four panes side by side, each on its own provider + model (sim, Cerebras, OpenRouter) continuing one shared story opening. Provider abstraction with shared SSE parsing, live model catalogs with cache/manual fallback and comparable-model suggestions, per-pane status (words/sec, first-chunk latency), a shared steering bar targeting all or the focused pane, pane add/remove with `arena-panes` persistence, and viewport-aware capacity that caps to a single pane where side-by-side panes can't stay readable. ADR 0006 records the OpenRouter provider.

### Changed

- GitHub Pages deploy pins actions by commit SHA, uses least-privilege permissions, and publishes the verified build to https://flyinggorillaz.github.io/spaceshipUI/. Only `master` in FlyingGorillaz/spaceshipUI deploys; pull requests and forks only run checks.
- Capture scripts use Playwright's Chromium (or `CHROMIUM`) instead of a hardcoded `/snap/bin/chromium`, and share their page helpers with the e2e suite (`scripts/capture/app.mjs`).

### Fixed

- Session restore waits for the stream to hold the saved caret's words instead of clamping to the first buffered words on reload.
- Phone layout now reserves the status tray's measured wrapped height, keeps the caret knob inside the viewport at the start of the text, and pauses rail-only model scoring where the rail is hidden; the mobile e2e suite runs against an iPhone 16 device profile.

### Security

- Spec Kit skills ask for confirmation before running a mandatory extension hook, and the spec template marks the user's description as untrusted data (ADR 0003).
