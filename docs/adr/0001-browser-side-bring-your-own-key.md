# 0001. Browser-side bring-your-own-key LLM calls

- Status: Accepted
- Date: 2026-11-17

## Context

Spaceship is a static GitHub Pages demo of realtime LLM interactions. Live mode needs Cerebras and Gemini access at interactive latency. There is no backend to hold keys or proxy requests.

## Decision

Users paste their own keys into the native `<dialog>`. Keys are stored in `localStorage` and sent from the browser straight to each provider's HTTPS endpoint. The simulator works without any key. The developer key stays in a git-ignored `.env` and is used only by Node scripts.

## Consequences

- No server cost and no shared secret to leak. Latency is as low as possible.
- Keys can be read by any script running on the origin. So the site must not include third-party scripts, must not insert untrusted HTML, and should add a Content-Security-Policy.
- CI scans the built bundle for key material so the developer key can never ship.
