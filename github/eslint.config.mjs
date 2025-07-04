import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        // CommonJS環境（Lambda向け）
        exports: "readonly",
        module: "readonly",
        require: "readonly"
      }
    },
    plugins: {
      "@typescript-eslint": typescript
    },
    rules: {
      ...js.configs.recommended.rules,
      ...typescript.configs.recommended.rules,
      "indent": ["error", 2],
      "quotes": ["error", "single", { "avoidEscape": true }],
      "semi": ["error", "always"],
      "eol-last": ["error", "always"],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_|^Pushover$"
      }],
      "no-unused-vars": "off",
      // Promise関連のルール
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // コード品質ルール
      "complexity": ["warn", 10],
      "max-lines-per-function": ["warn", {
        "max": 60,
        "skipBlankLines": true,
        "skipComments": true
      }],
      "max-lines": ["warn", {
        "max": 300,
        "skipBlankLines": true,
        "skipComments": true
      }],
      // セキュリティ関連ルール
      "no-eval": "error",
      "no-new-func": "error",
      "@typescript-eslint/no-dynamic-delete": "error",
      // console使用の制限
      "no-console": ["warn", {
        "allow": ["info", "warn", "error", "log"]
      }]
    }
  },
  {
    ignores: [
      "build/**",
      "dist/**",
      "eslint.config.mjs",
      "node_modules/**",
      "subscriber/**"
    ]
  }
];
