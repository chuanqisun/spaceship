import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        test: {
          name: "e2e",
          include: ["e2e/**/*.test.mjs"],
          globalSetup: ["e2e/serve-simulator.mjs"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          retry: process.env.CI ? 1 : 0,
        },
      },
    ],
  },
})
