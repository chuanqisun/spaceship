# Quickstart: Usability Remediation

Validation guide — proves each spec story end-to-end. Prereq: `npm run dev`
(serves at `/spaceship/`). All flows verifiable in **sim mode** (no keys).

## Setup

```sh
npm run dev -- --port 5280
# open http://localhost:5280/spaceship/
```

Automated spot-check (Playwright, devDependency `playwright-core`):

```sh
node scripts/ux-explore3.mjs   # existing exploration script; extend for new flows
```

## Story 1 — First-time discovery

1. Fresh profile / cleared localStorage → load page.
2. **Expect**: knob auto-advances revealing text within ~2 s; transient hint
   near knob; after ~8 s idle, attract animation plays (knob nudges ±words).
3. Drag knob once → hint never returns (reload to confirm persistence).

## Story 2 — Gesture legend

1. Click `?` in tray (or press `h`) → native dialog lists all gestures.
2. Escape closes. Tray glyphs show plain-language `title` on hover.

## Story 3 — Forgiving interactions

1. Scrub back past rest point → `↩ restore N words` chip appears in tray for
   ~10 s; click it → discarded text returns.
2. Double-click+hold knob, release inside dead zone → knob remains (choosing
   state), not deleted.
3. Plain drag-select text, release → normal selection (copy works, no box).
   ⌥-drag-select → attention box created.

## Story 4 — Visible steering affordances

1. With buffer ahead, faint ghost text renders beyond the caret.
2. Move pointer into empty region right of text → steering-zone hairline cue.
3. Drop + realize a future knob → pinned sentence flashes orange briefly; knob
   label visible in margin.

## Story 5 — Reach and persistence

1. `↑/↓/←/→` move caret one word; `Enter` toggles attention; works without mouse.
2. Touch device: knob drag, box drag, spawn-hold work; no custom cursor.
3. Toggle sound off → reload → still off.
4. `prefers-reduced-motion: reduce` → no attract/flash/spin animations.
5. Scrub to mid-text, add a box + future knob → reload → position, box, and
   knob setting restored (dimension permitting).

## Mode toggle

- First `sim` click with stored keys → button arms (`flight?`, 2.5 s); second
  click launches. Without keys → dialog as before.

## Regression checks

- `npm run build` (tsc + vite) clean.
- `npm run format` clean.
- Sim mode buffer/top-up/regen behavior unchanged (tray `¶`/`box`/`steer`/`pin`
  counters still accurate).
