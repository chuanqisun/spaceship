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

**Testing**: `tsc` typecheck + `vite build`; manual/Playwright verification scripts in `scripts/`

**Target Platform**: Desktop browsers (mouse/pen primary), touch-capable, keyboard

**Project Type**: Single-page web app (sim + live modes sharing all UI modules)

**Performance Goals**: 60 fps pointer tracking preserved; no layout thrash per frame; ghost text must not perturb `pretext` layout of shown text

**Constraints**: AGENTS.md — semantic HTML, native `<dialog>`, composition factories (no classes), `AsyncIterable`+`AbortSignal` sources, modern CSS vars/nesting, `npm run format` before done; `.env` Cerebras key only via `scripts/cerebras-dev.mjs` token tracking (untouched by this feature)

**Scale/Scope**: ~30 source files in `src/text/`; new modules for onboarding, legend, session, ghost rendering; edits across `main.ts`, `index.html`, `future-knobs.ts`, `attention-knobs.ts`, `pointer.ts`, `text-stream.ts`, `live-mode.ts`, `sound/engine.ts`

## Constitution Check

The project constitution (`.specify/memory/constitution.md`) is still the unfilled
template — `/speckit-constitution` has not been run. `AGENTS.md` is the de facto
governing document; this plan is checked against it:

- Semantic HTML / native `<dialog>`: PASS — legend and hints use `<dialog>` and
  existing elements; no custom dialog implementation.
- Composition factories, no classes: PASS — new modules follow the
  `createX(options) → small object` pattern.
- One module per concern, folder per feature: PASS — new concerns get their own
  files under `src/text/`.
- `AsyncIterable` + `AbortSignal` for async work: PASS — no new async sources;
  stream changes are synchronous state operations.
- CSS variables, nesting, system styles: PASS — ghost text, hint, zone cue, pin
  flash all use existing vars (`--ink-*`, `--hot`, `--hair`).
- `npm run format` at end: PASS (workflow step).

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
