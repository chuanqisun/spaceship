# Security Policy

## Supported versions

Only the latest commit on `master` (the deployed GitHub Pages site) receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Security -> Report a vulnerability** form on this repository. Do not open a public issue.

Include the affected page or file, steps to reproduce, and the impact. You will get an acknowledgement within 3 working days. Fix targets from triage: critical 7 days, high 30 days, medium 90 days.

## Key-handling model

- Spaceship is a static site. There is no backend, and it collects no analytics or telemetry.
- In live mode, the Cerebras and Gemini API keys you enter are stored only in your browser's `localStorage`. They are sent only to `api.cerebras.ai` and `generativelanguage.googleapis.com` over HTTPS.
- Anyone with access to your browser profile, or any script running on this origin, can read `localStorage`. Use a key with a low spend limit and revoke it when you are done.
- The developer key `CEREBRAS_DEV_API_KEY` is used only by local Node scripts from a git-ignored `.env`. CI fails the build if key material appears in `dist/` (`npm run check:bundle`).

## Automated checks

Every push and pull request runs gitleaks secret scanning, CodeQL and `npm audit --audit-level=high`. Pull requests also run dependency review. `npm run check` fails if a Spec Kit upgrade undoes the hardening in [ADR 0003](docs/adr/0003-hardening-vendored-spec-kit.md). Dependabot keeps npm packages and GitHub Actions up to date, with a 7-day cooldown.
