import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  base: `/${process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "spaceshipUI"}/`,
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        ...Object.fromEntries(
          readdirSync(resolve(import.meta.dirname, "extra"))
            .filter((file) => file.endsWith(".html"))
            .map((file) => [`extra/${file.slice(0, -".html".length)}`, resolve(import.meta.dirname, "extra", file)]),
        ),
      },
    },
  },
})
