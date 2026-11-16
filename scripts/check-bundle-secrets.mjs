import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..")
const DIST = resolve(ROOT, "dist")
const PATTERNS = [/CEREBRAS_DEV_API_KEY/, /GEMINI_API\b/, /\bcsk-[a-z0-9]{20,}/i, /\bAIza[0-9A-Za-z_-]{35}\b/]

if (!existsSync(DIST)) throw new Error("dist/ is missing: run `npm run build` first")

const secrets = envSecrets()
const leaks = filesIn(DIST).flatMap((file) => leaksIn(file, readFileSync(file, "utf8")))

if (leaks.length) {
  console.error(`Possible key material in the bundle:\n${leaks.join("\n")}`)
  process.exit(1)
}
console.log(`No key material found in ${relative(ROOT, DIST)}/`)

function leaksIn(file, text) {
  const name = relative(ROOT, file)
  return [
    ...PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) => `${name}: matches ${pattern}`),
    ...secrets.filter((secret) => text.includes(secret)).map(() => `${name}: contains a value from .env`),
  ]
}

function envSecrets() {
  const env = resolve(ROOT, ".env")
  if (!existsSync(env)) return []
  return [...readFileSync(env, "utf8").matchAll(/^\s*[A-Z0-9_]+\s*=\s*(.+?)\s*$/gm)]
    .map(([, value]) => value.replace(/^["']|["']$/g, ""))
    .filter((value) => value.length >= 16 && !/your_api_key_here/.test(value))
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return filesIn(path)
    return /\.(js|mjs|html|css|json|map|txt)$/.test(entry.name) ? [path] : []
  })
}
