# 0003. Hardening the vendored Spec Kit files

- Status: Accepted
- Date: 2026-11-17

## Context

Spec Kit ships its skills (`.devin/skills/speckit-*`) and templates (`.specify/templates/`) as files we vendor unchanged. Code scanning flagged two risks in them:

- Every skill told the agent to run any mandatory hook listed in `.specify/extensions.yml` without asking. That file is ordinary repository content, so a pull request could make the agent run commands nobody approved.
- The spec template pasted the user's description into `spec.md` as plain text. Later skills read `spec.md` as intent, so instruction-like text in it could steer planning and task generation.

## Decision

Patch the vendored files. Mandatory hooks now need explicit user confirmation in the session, and only commands that resolve to an installed `speckit-*` skill may run. The spec template quotes the user's description and labels it as untrusted data, not instructions.

`npm run check:speckit` (part of `npm run check`) fails if a Spec Kit upgrade restores the original text.

## Consequences

- Mandatory hooks pause for a confirmation. No hooks are configured today, so nothing changes in practice yet.
- After each Spec Kit upgrade, re-apply the patches when `check:speckit` fails. If upstream adopts an equivalent fix, drop the patch and the check.
