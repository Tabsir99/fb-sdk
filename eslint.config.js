import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "src/temp/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Type-aware rules for source and tests. These are the ones that catch the
  // bug classes this codebase has actually hit: forgotten awaits on thenables
  // (no-floating-promises) and accidental runtime imports of type-only symbols
  // through the client.ts hub (consistent-type-imports + verbatimModuleSyntax).
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.test.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      // The BatchableRequest internals are intentionally untyped at the
      // implementation layer; the public surface stays fully typed.
      "@typescript-eslint/no-explicit-any": "off",
      // Rest-sibling destructuring is used to EXCLUDE keys (e.g. splitting the
      // synthetic `post` selector out of comment fields); _-prefix marks
      // intentionally unused parameters, mirroring tsc's behaviour.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Compile-time type tests declare values purely for assignability checks.
  {
    files: ["tests/types/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
);
