import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".next-desktop/**", "desktop-dist/**", "out/**", "build/**", "next-env.d.ts", "public/stockfish/**"]),
  { files: ["desktop/*.cjs", "scripts/desktop-smoke.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
]);
