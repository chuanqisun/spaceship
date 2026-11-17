import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Merges the per-file V8 coverage snapshots written by `e2e/coverage.mjs` (`E2E_COVERAGE=1 npm run test:e2e`)
 * into a per-source-file line report. A line counts as coverable when it sits inside a V8 coverage range
 * (executable code, not comments or blanks) and covered when the smallest range containing it ran — so an
 * untaken branch inside a running function still reads as uncovered.
 */
const DIR = "coverage-e2e"
const files = readdirSync(DIR).filter((file) => file.endsWith(".json"))
if (!files.length) {
  console.error(`No coverage snapshots in ${DIR}/ — run E2E_COVERAGE=1 npm run test:e2e first`)
  process.exit(1)
}

const byUrl = new Map()
for (const file of files) {
  const { sources, entries } = JSON.parse(readFileSync(join(DIR, file), "utf8"))
  for (const [url, source] of Object.entries(sources)) {
    if (!byUrl.has(url)) byUrl.set(url, { source, entries: [] })
    byUrl.get(url).entries.push(...entries.filter((entry) => entry.url === url))
  }
}

const lineStarts = (text) => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1)
  return starts
}

const report = []
for (const [url, { source, entries }] of byUrl) {
  const path = decodeURIComponent(new URL(url).pathname).replace(/^\/[^/]+\//, "")
  if (!path.startsWith("src/")) continue
  const starts = lineStarts(source)
  const offsetOfLine = (line) => starts[line]
  const lineOf = (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  const coverable = new Set()
  const covered = new Set()
  for (const entry of entries) {
    const ranges = entry.functions.flatMap((fn) => fn.ranges)
    if (!ranges.length) continue
    const lineCount = starts.length
    for (let line = 0; line < lineCount; line++) {
      const offset = offsetOfLine(line)
      const containing = ranges.filter((r) => r.startOffset <= offset && offset < r.endOffset)
      if (!containing.length) continue
      coverable.add(line)
      const smallest = containing.reduce((a, b) => (b.endOffset - b.startOffset < a.endOffset - a.startOffset ? b : a))
      if (smallest.count > 0) covered.add(line)
    }
  }
  report.push({ path, covered: covered.size, coverable: coverable.size })
}

report.sort((a, b) => a.covered / a.coverable - b.covered / b.coverable)
let totalCovered = 0
let totalCoverable = 0
for (const { path, covered, coverable } of report) {
  totalCovered += covered
  totalCoverable += coverable
  const pct = coverable ? ((covered / coverable) * 100).toFixed(1) : "100.0"
  console.log(`${pct.padStart(6)}%  ${String(covered).padStart(5)}/${String(coverable).padEnd(5)}  ${path}`)
}
console.log(
  `\nTotal: ${((totalCovered / totalCoverable) * 100).toFixed(1)}% lines covered (${totalCovered}/${totalCoverable} coverable lines, ${report.length} files)`,
)
