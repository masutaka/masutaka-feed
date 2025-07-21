import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import stylistic from "@stylistic/eslint-plugin";

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
      "@stylistic": stylistic,
      "@typescript-eslint": typescript,
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
        "varsIgnorePattern": "^_"
      }],
      "no-unused-vars": "off",
      // Promise関連のルール
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // コード品質ルール
      "complexity": ["warn", 10],
      "max-lines-per-function": ["warn", {
        "max": 50,
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
      }],
      // 関数スタイルの統一
      "func-style": ["error", "expression", { "allowArrowFunctions": true }],
      // 関数パラメータの改行
      "function-paren-newline": ["error", "multiline-arguments"],
      // 最大行長
      "max-len": ["error", { "code": 120, "ignoreComments": true, "ignoreStrings": true }],
      // interface各メンバーのセミコロン必須化
      "@stylistic/member-delimiter-style": ["error", {
        "multiline": {
          "delimiter": "semi",
          "requireLast": true
        },
        "singleline": {
          "delimiter": "semi",
          "requireLast": true
        }
      }],
      // 命名規則
      "@typescript-eslint/naming-convention": [
        "error",
        { "selector": "default", "format": ["camelCase"], "leadingUnderscore": "allow" },
        { "selector": "variable", "format": ["camelCase", "UPPER_CASE", "PascalCase"], "leadingUnderscore": "allow" },
        { "selector": "function", "format": ["camelCase"] },
        { "selector": "typeLike", "format": ["PascalCase"] },
        // オブジェクトのプロパティは任意の形式を許可（AWS SDK等のため）
        { "selector": "objectLiteralProperty", "format": null },
        // 型のプロパティも任意の形式を許可（RSS等の特殊な名前のため）
        { "selector": "typeProperty", "format": null }
      ],
      // オブジェクトプロパティの省略記法を強制
      "object-shorthand": ["error", "always"]
    }
  },
  {
    ignores: [
      "build/**",
      "dist/**",
      "eslint.config.mjs",
      "node_modules/**"
    ]
  }
];
