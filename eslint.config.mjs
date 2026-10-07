import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Screenshots written by npm run test:stage.
    ".stage-shots/**",
    // Local tool state, including other checkouts of this repo, each linted from its own root.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
