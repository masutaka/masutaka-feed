# ESLint設定改善計画

## 現状の課題

1. **重複した設定**: `github/eslint.config.mjs`と`hatebu/eslint.config.mjs`がほぼ同じ内容
2. **コードスタイルの不統一**: シングルクォートとダブルクォートが混在（現在は `"quotes": "off"` で混在を許可）
3. **型チェックの未活用**: TypeScriptの型情報を使った高度なlintingが無効
4. **AWS Lambda環境への最適化不足**: Lambda固有のグローバル変数が未定義

## 改善案

### 1. 共通設定ファイルの作成

**`eslint.config.base.mjs`** (ルートディレクトリに作成)

```javascript
import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export const baseConfig = {
  files: ["**/*.{js,mjs,ts}"],
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: "module",
    parser: tsParser,
    globals: {
      // 基本的なNode.js環境
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
    // 基本的なコードスタイル
    "indent": ["error", 2],
    "quotes": ["error", "single", { "avoidEscape": true }], // シングルクォートで統一
    "semi": ["error", "always"],
    "eol-last": ["error", "always"],
    
    // TypeScript関連の緩和
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-require-imports": "off",
    "no-undef": "off",
    
    // 未使用変数の設定
    "@typescript-eslint/no-unused-vars": ["error", {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    "no-unused-vars": "off",
    
    // console使用の制限
    "no-console": ["warn", { 
      allow: ["info", "warn", "error", "log"] 
    }]
  }
};

export const commonIgnores = {
  ignores: [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".aws-sam/**",
    "eslint.config.mjs"
  ]
};
```

### 2. 各サブディレクトリの設定を簡潔化

**`github/eslint.config.mjs`**

```javascript
import { baseConfig, commonIgnores } from "../eslint.config.base.mjs";

export default [
  {
    ...baseConfig,
    languageOptions: {
      ...baseConfig.languageOptions,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      ...baseConfig.rules,
      // github固有: Pushover型を例外に追加
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_|^Pushover$"
      }]
    }
  },
  commonIgnores
];
```

**`hatebu/eslint.config.mjs`**

```javascript
import { baseConfig, commonIgnores } from "../eslint.config.base.mjs";

export default [
  {
    ...baseConfig,
    languageOptions: {
      ...baseConfig.languageOptions,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: baseConfig.rules // hatebu固有のルールは現在なし
  },
  commonIgnores
];
```

### 3. クォートスタイルの統一

#### 段階的な移行手順

**Phase 1: 警告モードで導入**
```javascript
"quotes": ["warn", "single", { "avoidEscape": true }],
```

**Phase 2: 自動修正の実行**
```bash
# 各ディレクトリで実行
make fmt-eslint

# または個別に
cd github && npx eslint --fix .
cd hatebu && npx eslint --fix .
```

**Phase 3: エラーモードに変更**
```javascript
"quotes": ["error", "single", { "avoidEscape": true }],
```

#### 移行時の考慮事項

1. **正規表現パターン**: 可読性を重視して選択
   ```typescript
   // どちらも許容
   const pattern1 = /don't/;
   const pattern2 = /don\'t/;
   ```

2. **テンプレートリテラル**: 変数展開が必要な場合は使用
   ```typescript
   const name = 'World';
   const greeting = `Hello ${name}`;  // OK
   ```

3. **JSON文字列**: ダブルクォートが必要な場合
   ```typescript
   const jsonString = '{"name": "value"}';  // OK
   ```

### 4. 将来的な改善提案

#### 3.1 型チェックを活用したルールの追加

```javascript
// typescript.configs.recommendedRequiringTypeCheckingを有効化
import { configs as tsConfigs } from "@typescript-eslint/eslint-plugin";

// baseConfigのrulesに追加
...tsConfigs.recommendedRequiringTypeChecking.rules,
"@typescript-eslint/no-floating-promises": "error",
"@typescript-eslint/await-thenable": "error",
"@typescript-eslint/no-misused-promises": "error"
```

#### 3.2 コード品質向上のためのルール

```javascript
// 複雑度の制限
"complexity": ["warn", 10],

// 関数の長さ制限
"max-lines-per-function": ["warn", {
  max: 50,
  skipBlankLines: true,
  skipComments: true
}],

// ファイルの長さ制限
"max-lines": ["warn", {
  max: 300,
  skipBlankLines: true,
  skipComments: true
}]
```

#### 3.3 セキュリティ関連のルール

```javascript
// eval()の使用禁止
"no-eval": "error",

// new Function()の使用禁止
"no-new-func": "error",

// 動的なrequireの使用禁止
"@typescript-eslint/no-dynamic-delete": "error"
```

## 実装手順

1. **フェーズ1**: 共通設定ファイルの作成と既存設定のリファクタリング
   - 重複した設定を共通ファイルに統合
   - 各サブディレクトリの設定を簡潔化
   - 現状のルールは変更せず、構造のみリファクタリング

2. **フェーズ2**: 基本的な設定改善とコードスタイルの統一
   - AWS Lambda環境のグローバル変数追加
   - クォートスタイルをシングルクォートに統一
   - 警告モード → 自動修正 → エラーモードの段階的移行
   - ファイル終端の改行などの基本的なフォーマット統一

3. **フェーズ3**: 型チェックを活用したルールの段階的導入
   - `recommendedRequiringTypeChecking` の有効化
   - Promise関連のルール追加
   - TypeScript固有の高度なルール

4. **フェーズ4**: コード品質・セキュリティルールの追加
   - 複雑度・ファイルサイズの制限
   - セキュリティ関連ルールの強化
   - プロジェクト固有のカスタムルール

## メリット

1. **保守性の向上**: 設定の重複を排除し、変更時の作業量を削減
2. **一貫性の確保**: 全サブプロジェクトで同じルールを適用
3. **コードスタイルの統一**: シングルクォートで統一されたクリーンなコードベース
4. **段階的な改善**: 必要に応じてルールを追加・調整可能
5. **TypeScriptの活用**: 型情報を使った高度なエラー検出
6. **業界標準への準拠**: TypeScriptコミュニティの慣習に従う

## 注意事項

- 新しいルールを追加する際は、既存コードへの影響を確認
- チーム全体でルールの合意を取ってから実装
- CI/CDパイプラインでのlint実行を必須化