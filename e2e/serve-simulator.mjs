import { createServer } from "vite"

/** Serves the app for the end-to-end suite in sim mode, so every model call is played by a simulated source: no network, no keys. */
export default async function serveSimulator({ provide }) {
  const server = await createServer({ configFile: "vite.config.ts", logLevel: "warn", server: { port: 5290, strictPort: false } })
  await server.listen()
  provide("appUrl", server.resolvedUrls.local[0])
  return () => server.close()
}
