import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.{test,spec}.js"],
    exclude: ["node_modules", "dist", "obf_src"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: [
        "core/**/*.js",
        "middlewares/**/*.js",
        "services/**/*.js",
        "utils/**/*.js",
      ],
      exclude: [
        "**/*.routes.js",
        "**/*.validate.js",
        "**/*.validation.js",
        "tests/**",
        "scripts/**",
      ],
    },
    // The `config` package reads ENV before any `import config from "config"`.
    // tests/setup.js sets process.env.NODE_CONFIG before any test code runs.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
