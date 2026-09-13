// Industry-standard baseline: catches real bugs (typos via no-undef, dead
// code via no-unused-vars) without style wars. Run with `npm run lint`.
import globals from "globals";

export default [
  { ignores: ["node_modules/**"] },
  {
    files: ["src/**/*.js", "scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
