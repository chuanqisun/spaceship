## HTML

1. Use semantic HTML. If a UI can be determined ahead of time, prefer HTML over JavaScript for rendering.
2. For dialog, use latest HTML standard dialog API. Don't implement your own.

## TypeScript

1. Modern syntax. Organize logic from general to specific with pure function in the end.
2. Use semantic naming and avoid comments unless doing something non-obvious. No section divider comments.

## Styling

1. Use modern CSS, use css variables to ensure style consistency, allow nesting. Use simple grid and flexbox for layout
2. Simple monospace font, black/white high contrast. Uniform font size and simple consistent spacing.
3. Use system default styles to reduce the use of css.
4. Keep the palette near-white and spend `--hot` on the one thing changing right now; a reserved accent reads louder than a wide palette.

## Ambience (studied in `extra/Designer Profile.html`)

1. Choreograph a one-shot intro off a single `--cue` multiplier; compute per-letter delays from measured geometry (`getBoundingClientRect`), not DOM order.
2. A fixed full-screen canvas at `z-index: -1` is the world. Pre-render glow sprites to small offscreen canvases keyed by color and `drawImage` per frame; `lighter` composite for glow, `source-over` for occluders.
3. Per-word custom properties (`--lit`) plus `color-mix` let text respond to the pointer with no layout work.
4. Gesture maps to physics, not tweens: inertia with exponential decay (`exp(-dt/tau)`); `linear()` springs for press feedback.
5. Link sky color to the story: hash a keyword to a constrained hue, paint its sprite lazily, cache by color. Repeated words share one sprite.
6. Anchor sprites to meaning, not position alone: sentence edges (`sentenceSpans` + `wordSpans`) are free anchors; the model's `Lead.keyword` (attention boxes) and `keyword-relevance` score are the meaningful ones.
7. Gate motion on `prefers-reduced-motion`, hover effects on `@media (hover: hover)`, and swap controls per pointer type (buttons for mouse, pinch for touch).

## Code organization

1. Each page's `main.ts` is a composition: it queries the DOM, creates modules, and wires events between them. Move state machines, algorithms, and async flows into modules.
2. One module per concern, grouped in a folder per feature. Name the file after the concern it owns.
3. Abstract by composition. Expose a factory function that closes over its state and returns a small object, or a plain function. No classes or inheritance.
4. Define a seam only where implementations really vary, as a function or small object type (e.g. `TextSource` with simulated and live versions). Pass it in as an argument.
5. No simple wrappers. An abstraction must own state or logic; if it only renames or forwards to another function, call that function directly.
6. Extract shared code on the second real use, not in anticipation.
7. Model async work as an `AsyncIterable` that accepts an `AbortSignal`, so simulated and real sources are interchangeable and cancellable.

## Workflow

1. Run `npm run format` (Prettier) at the end of your work, before reporting back or committing. Also run `npm run check` (typecheck, unit tests, end-to-end UX tests, build); write the failing test first, colocated as `*.test.ts` for logic, or in `e2e/` for gestures and interactions.
2. Project standards (security, testing, docs, CI/CD) live in `.specify/memory/constitution.md`. Use the Spec Kit skills (`/speckit-specify` -> `/speckit-plan` -> `/speckit-tasks` -> `/speckit-implement`) for non-trivial features.
3. The shell is zsh: quote globs (e.g. `--include="*.ts"`) and wrap bash-only syntax in `bash -c`.

## Prototyping with the LLM

1. `.env` holds `CEREBRAS_DEV_API_KEY` for prototyping ideas and engineering prompts from scripts. Never print it, commit it, or ship it to the browser; the app itself reads the user's key from localStorage.
2. Every call made with that key must track its token usage. Call the API through `chat` in `scripts/cerebras-dev.mjs`, which keeps `token-usage.log` as readable text: the accumulated totals at the top (rewritten on every call) and one appended row per call below (time, script, prompt, cached, completion, reasoning and total tokens). The log is git-ignored.
