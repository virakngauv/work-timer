import { globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  ...nextVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
];
