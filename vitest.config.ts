import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**"],
      reporter: ["text", "lcov"],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
