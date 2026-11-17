# 0006. OpenRouter as a second story provider

- Status: Accepted
- Date: 2026-11-17

## Context

Spec `003-parallel-inference` adds a comparison page (`arena.html`) that runs
up to four story panes side by side, each bound to a provider + model. The
feature's headline is Cerebras fast inference against a comparable
standard-speed model served through OpenRouter, so OpenRouter becomes the
second `Provider` implementation alongside Cerebras and the simulator.

## Decision

- **Provider abstraction in `src/llm/provider.ts`.** A `Provider` owns its
  endpoints, key storage key, `listModels`, and a streaming `chat(request)`
  that yields text deltas. `ChatRequest` carries `apiKey` as its first field,
  mirroring the flagship's `CompletionRequest`.
- **OpenRouter is OpenAI-compatible.** It reuses the same SSE `data:` /
  `[DONE]` / `choices[0].delta.content` parsing as Cerebras, extracted into
  `src/llm/sse.ts`. Its chat endpoint is
  `POST https://openrouter.ai/api/v1/chat/completions` and its catalog is
  `GET https://openrouter.ai/api/v1/models` (keyed variant
  `/api/v1/models/user` when a key is present).
- **Endpoints are module constants.** Both OpenRouter origins are added to
  the connect-src allowlist posture used for `api.cerebras.ai`; they are
  never derived from user input.
- **Keys stay per-provider.** `openrouter-api-key` is a separate
  localStorage key sent only as `Authorization: Bearer` to openrouter.ai.
  A missing key fails only the panes that need it.
- **Catalog caching.** `src/llm/catalog.ts` caches each provider's model
  list under `models-catalog-<provider>` with a `fetchedAt` timestamp; the
  picker degrades to cache, then manual entry. OpenRouter `?q=` search is
  debounced ≥150 ms and cached for the session only.
- **No new dependencies.** Both providers speak the same wire format, so the
  comparison page adds zero runtime packages.

## Consequences

- Adding a further OpenAI-compatible provider is a registry entry plus an
  ADR, per the same rule that produced this one.
- The flagship `index.html` page is unchanged except for the `arena` link in
  its tray; all provider logic lives behind `src/arena/` and `src/llm/`.
- OpenRouter's large catalog requires the picker to filter server-side or
  paginate; a naive full-list render is not acceptable (contract
  `contracts/providers.md`).
- Rate limits are per provider and per pane; the system does not coordinate
  quotas across providers (spec edge cases).
