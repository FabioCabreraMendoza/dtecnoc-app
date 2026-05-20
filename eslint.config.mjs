import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Allow _prefixed params (unused-by-design, e.g. _req in API handlers)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // useEffect(fn,[]) is flagged but is a common and safe fetch-on-mount pattern
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
