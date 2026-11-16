import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

// Spec Kit upgrades overwrite the vendored skills and templates, which would silently undo the two
// hardening patches recorded in docs/adr/0003-hardening-vendored-spec-kit.md. This fails the check instead.
const ROOT = resolve(import.meta.dirname, "..")
const SKILLS = resolve(ROOT, ".devin/skills")
const SPEC_TEMPLATE = resolve(ROOT, ".specify/templates/spec-template.md")

const problems = [
  ...readdirSync(SKILLS)
    .map((skill) => join(SKILLS, skill, "SKILL.md"))
    .filter((file) => readFileSync(file, "utf8").includes("MUST actually invoke the hook"))
    .map((file) => `${relative(ROOT, file)}: runs mandatory hooks without user confirmation`),
  ...(readFileSync(SPEC_TEMPLATE, "utf8").includes('User description: "$ARGUMENTS"')
    ? [`${relative(ROOT, SPEC_TEMPLATE)}: records the user description without marking it as untrusted data`]
    : []),
]

if (problems.length) {
  console.error(`Spec Kit hardening was reverted, re-apply it (see ADR 0003):\n${problems.join("\n")}`)
  process.exit(1)
}
console.log("Spec Kit hardening patches are in place")
