## Summary

<!-- What changed and why. Link the spec (specs/NNN-feature) if there is one. -->

## How it was verified

<!-- Tests added or changed. For interaction changes, what you checked in the simulator. -->

## Constitution checklist

- [ ] Tests written first and `npm test` passes
- [ ] `npm run format`, `npm run typecheck` and `npm run build && npm run check:bundle` pass
- [ ] No secrets, keys or `.env` values in code, tests, logs or the bundle
- [ ] Untrusted text (model output, user input) is never inserted with `innerHTML`
- [ ] Async work is cancellable (`AbortSignal`) and stale speculative output is discarded
- [ ] README, CHANGELOG (`Unreleased`), AGENTS.md and ADRs updated where affected
- [ ] New dependencies are at least 7 days old, MIT-compatible and justified above
