# Implementation Plan: Usability Remediation

**Branch**: `001-usability-remediation` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-usability-remediation/spec.md`

## Summary

Remediate the hidden-interaction-model problems found in `docs/usability-review.md`
(spec coverage: all improvements P0–P4). The work is presentation-layer plus a
small amount of stream state: auto-reveal and idle attract on load, a gesture
legend dialog, forgiving dead-zone/restore/selection semantics, ghost text and a
visible steering zone, pin-provenance flash, keyboard nudge, sound + session
persistence, reduced-motion support, and a two-step mode toggle. All changes
respect the existing architecture (composition factories, `AsyncIterable`
sources, native `<dialog>`, CSS variables, Custom Highlight API).

## Technical Context

**Language/Version**: TypeScript ~7.0 (Vite 8, vanilla DOM, no framework)

**Primary Dependencies**: `@chenglou/pretext` (text layout), `@fontsource-variable/jetbrains-mono`, `playwright-core` (dev-only, for verification)

**Storage**: `localStorage` (API keys already stored; new keys for sound pref, hint dismissal, session state)

**Testing**: Vitest unit tests (`src/**/*.test.ts`) + Playwright e2e UX suite (`e2e/`, per constitution Principle VI); `npm run check` is the gate

**Target Platform**: Desktop browsers (mouse/pen primary), touch-capable, keyboard

**Project Type**: Single-page web app (sim + live modes sharing all UI modules)

**Performance Goals**: 60 fps pointer tracking preserved; no layout thrash per frame; ghost text must not perturb `pretext` layout of shown text

**Constraints**: AGENTS.md — semantic HTML, native `<dialog>`, composition factories (no classes), `AsyncIterable`+`AbortSignal` sources, modern CSS vars/nesting, `npm run format` before done; `.env` Cerebras key only via `scripts/cerebras-dev.mjs` token tracking (untouched by this feature)

**Scale/Scope**: ~30 source files in `src/text/`; new modules for onboarding, legend, session, ghost rendering; edits across `main.ts`, `index.html`, `future-knobs.ts`, `attention-knobs.ts`, `pointer.ts`, `text-stream.ts`, `live-mode.ts`, `sound/engine.ts`

## Constitution Check

Checked against `.specify/memory/constitution.md` v1.1.1 (ratified 2026-11-17):

- **I. Composition-First TypeScript**: PASS — new modules are factory functions
  composed by `main.ts`; no classes; `tsc` clean.
- **II. Semantic, Accessible, Minimal UI**: PASS — legend uses native `<dialog>`;
  `#hint` is `aria-hidden` visual-only transient; `#zone-cue` and
  `.ghost` are `aria-hidden` and `pointer-events: none`; `#pointer` and
  `.future` carry plain-language `aria-label`s (e2e asserts every control has an
  accessible name); `@media (prefers-reduced-motion)` block covers knob, hint,
  zone cue, generating pulse and tray transitions; sound toggle persists.
- **III. Realtime Responsiveness and Cancellation**: PASS — no new async
  sources; stream changes are synchronous state ops; `stream.restore` aborts
  in-flight generation before re-appending.
- **IV. Secure by Default**: PASS — no new network calls, no `innerHTML`, no new
  dependencies, no secrets; ghost/hint/legend content is static or `textContent`.
- **V. Privacy and Cost Accountability**: PASS — no analytics; no token-spending
  scripts touched.
- **VI. Test-First Quality**: PASS (remediated post-analysis) — unit tests cover
  `text-stream` restore/truncate and `session` load/save validation; e2e suite
  covers the new gestures (legend, keyboard nudge/Enter, ghost text, zone cue,
  restore chip, session restore, sound persistence, auto-reveal/hint, touch,
  reduced motion, mode arm). `npm test` and `npm run test:e2e` must pass.
- **VII. Documentation as Code**: PASS (remediated post-analysis) —
  `docs/user-guide.md` and `docs/usability-review.md` updated; `README.md` and
  `CHANGELOG.md` `Unreleased` updated for the user-visible changes.
- **VIII–IX. CI/CD and Supply Chain**: PASS — no workflow or dependency changes.

No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/001-usability-remediation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/ui.md      # Phase 1 output (UI behavior contract)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
index.html                     # legend dialog, hint element, zone cue element, tray additions
src/
├── dom.ts                     # unchanged ($ helper)
├── point.ts                   # unchanged
├── llm/                       # unchanged
├── story/                     # unchanged
└── text/
    ├── main.ts                # composition root: wire new modules, auto-reveal, keyboard, persistence hooks
    ├── attention-knobs.ts     # selection→box gating (explicit action), box drag unchanged
    ├── future-knobs.ts        # dead-zone release no longer deletes; pin flash trigger
    ├── live-mode.ts           # two-step mode toggle preview
    ├── pointer.ts             # ahead-zone cue hooks, readout additions
    ├── text-stream.ts         # restore() for discarded tails
    ├── sound/engine.ts        # persisted sound preference
    ├── onboarding.ts          # NEW: auto-reveal, first-drag hint, idle attract
    ├── legend.ts              # NEW: gesture legend dialog content + open/close
    ├── ghost-text.ts          # NEW: render buffered words ahead of caret at low emphasis
    ├── session.ts             # NEW: save/restore caret, boxes, future knobs to localStorage
    ├── keyboard.ts            # NEW: arrow-key caret nudge, Enter expand, h legend
    └── zone-cue.ts            # NEW: ahead-region boundary indicator
```

**Structure Decision**: Single-page app; new concerns are additional modules in
`src/text/` composed by `main.ts`, matching AGENTS.md organization rules. No new
directories.

## Complexity Tracking

Not applicable — no constitution violations.
