import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    typecheck: {
      // Without this, plain `vitest run` silently skips every test in tests/types/.
      enabled: true,
      include: ["tests/types/**/*.test-d.ts"],
      tsconfig: "./tsconfig.test.json",
    },
  },
});
