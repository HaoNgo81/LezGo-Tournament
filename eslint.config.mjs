import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", ".next-lezgo/**", ".next-ci/**", "node_modules/**", "out/**", ".npm-cache/**"],
  },
];

export default eslintConfig;