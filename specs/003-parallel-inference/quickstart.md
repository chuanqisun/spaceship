# Quickstart: Parallel Model Comparison

## Prerequisites

- `npm ci` && `npm run dev` (Vite dev server)
- For live mode: a Cerebras key and/or an OpenRouter key (stored in the browser via the key dialog)
- Sim mode needs no keys and no network

## Validation scenarios

### 1. Sim-mode 4-pane grid (hermetic, no keys)

1. Open `/arena.html` (or navigate via the new link).
2. Add four panes, all `sim` provider.
3. **Expected**: four columns fill the screen; each streams a continuation of the same opening; dragging a pane's knob regenerates only that pane; the shared steering bar in "all" mode regenerates all four.

### 2. Live Cerebras vs OpenRouter

1. Enter keys in the dialog (first launch prompts; stored afterwards per provider).
2. Pane A: provider `cerebras`, pick a model from the auto-discovered list. Pane B: provider `openrouter`, pick a comparable model (picker shows suggestions).
3. **Expected**: both stream the same prefix; the status line shows Cerebras's lower `firstChunkMs`/higher `wordsPerSecond` — the comparison is directly visible.

### 3. Auto-discovery & fallback

1. With a valid key, open a pane's model picker: list appears without typing a model id.
2. Disconnect network / use a bad key: picker shows cached list (stale-flagged) or manual entry; pane still configurable.
3. **Expected**: no picker crash; manual id entry always works.

### 4. Failure isolation

1. Configure pane C with an invalid OpenRouter key or a removed model id.
2. **Expected**: pane C shows its error slot; panes A/B keep streaming and steering normally.

### 5. Steering modes

1. Set a key phrase / dimension control in the bar with target "all": every pane regenerates from its caret with identical steering.
2. Focus pane B, edit the bar: only pane B regenerates.
3. **Expected**: divergent pane texts remain divergent — steering changes manner, not retroactive prefix.

### 6. Lifecycle

1. Add a third pane mid-stream, change pane A's model, remove pane D.
2. **Expected**: existing panes never restart; count capped at 4 with a clear message on a fifth.

### 7. Small-screen degradation

1. Open `/arena.html` in a phone-sized touch viewport (393×659, hasTouch/isMobile).
2. **Expected**: at most one pane is shown (or a clear notice explains that side-by-side comparison requires a larger screen); no way to add a second pane. On desktop the same page still offers up to 4 panes.

## Automated coverage

- `npm test` — unit: SSE parsing per provider, catalog cache/fallback, pane steering fan-out, grid cap.
- `npm run test:e2e` — sim-mode arena: 4-pane render, steer-all regeneration, knob scrub isolation, and phone-viewport pane-cap degradation.
- `npm run check` — full gate before merge.
