import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Opt-in V8 coverage for the e2e suite (`E2E_COVERAGE=1 npm run test:e2e`). Each test file accumulates the
 * covered ranges of every served `src/` module across its pages, snapshots the transformed sources while the
 * dev server is still up, and writes `coverage-e2e/<name>.json` for `scripts/e2e-coverage.mjs` to merge.
 */
const ENABLED = !!process.env.E2E_COVERAGE
const entries = []
const sources = new Map()

export async function startCoverage(page) {
  if (ENABLED) await page.coverage.startJSCoverage({ resetOnNavigation: false })
}

export async function stopCoverage(page) {
  if (!ENABLED) return
  for (const entry of await page.coverage.stopJSCoverage()) {
    if (!entry.url.includes("/src/")) continue
    entries.push({ url: entry.url, functions: entry.functions })
    if (!sources.has(entry.url)) {
      try {
        sources.set(entry.url, await (await fetch(entry.url)).text())
      } catch {
        // A module that failed to fetch still reports its ranges; the report skips it for lack of source.
      }
    }
  }
}

export function flushCoverage(name) {
  if (!ENABLED) return
  mkdirSync("coverage-e2e", { recursive: true })
  writeFileSync(join("coverage-e2e", `${name}.json`), JSON.stringify({ sources: Object.fromEntries(sources), entries }))
}

export function coverageEnabled() {
  return ENABLED
}
