# TypeScript 移行計画

この文書は masutaka-feed プロジェクトを JavaScript から TypeScript に段階的に移行するための計画を記述します。

## 移行方針

**最初は JavaScript そのままで型をせずに TypeScript 化して、段々と型を付与していく**

この方針に従い、動作を維持しながら段階的に移行を進めます。

## プロジェクト概要

- AWS SAM を使用したサーバーレスアプリケーション
- Node.js 22 ランタイム
- 2つの独立したLambda関数
  - `github/`: GitHub活動フィードを処理
  - `hatebu/`: はてブお気に入りを処理

## 移行フェーズ

### フェーズ1: TypeScript 環境準備

#### 1.1 各関数ディレクトリでの TypeScript パッケージ追加

**github/ ディレクトリ:**
```bash
cd github
npm install --save-dev typescript @types/node @types/aws-lambda
```

**hatebu/ ディレクトリ:**
```bash
cd hatebu
npm install --save-dev typescript @types/node @types/aws-lambda
```

#### 1.2 tsconfig.json の作成

各関数ディレクトリに `tsconfig.json` を作成：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "allowJs": true,
    "checkJs": false,
    "noImplicitAny": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 1.3 ディレクトリ構造変更

各関数で `src/` ディレクトリを作成し、コードを移動：

```
github/
├── src/
│   └── index.ts  (index.js から移動・リネーム)
├── dist/         (コンパイル出力先)
├── package.json
├── tsconfig.json
└── Makefile
```

#### 1.4 package.json の更新

各関数の `package.json` に build スクリプトを追加：

```json
{
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

#### 1.5 Makefile の更新

各関数の `Makefile` を更新：

```makefile
NPM := npm

all: build

.PHONY: install
install:
	@$(NPM) install

.PHONY: build
build: install
	@$(NPM) run build

.PHONY: clean
clean:
	@$(NPM) run clean
```

### フェーズ2: ファイル拡張子変更と基本設定

#### 2.1 JavaScript ファイルの TypeScript 化

1. `index.js` を `src/index.ts` に移動・リネーム
2. 最初は型定義なしでコンパイルが通ることを確認

#### 2.2 SAM template.yaml の更新

各関数の CodeUri を調整（必要に応じて）：

```yaml
GithubFunction:
  Type: AWS::Serverless::Function
  Properties:
    CodeUri: github/dist/  # または github/ のまま
    Handler: index.handler
```

#### 2.3 動作確認

各フェーズで以下を確認：
```bash
# ビルド確認
make build

# デプロイテスト（環境変数設定後）
make deploy
```

### フェーズ3: 段階的型付与

#### 3.1 基本的な型定義

**環境変数の型定義:**
```typescript
interface EnvironmentVariables {
  MY_ACCESS_TOKEN: string;
  MASTODON_URL: string;
  MASTODON_ACCESS_TOKEN: string;
  // github 固有
  GITHUB_TITLE_IGNORE_REGEXP?: string;
  GITHUB_TITLE_PUSHOVER_REGEXP?: string;
  PUSHOVER_USER_KEY?: string;
  PUSHOVER_APP_TOKEN?: string;
}
```

**Lambda handler の型定義:**
```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  // 既存のロジック
};
```

#### 3.2 外部ライブラリの型

**masto ライブラリ:**
- 既に TypeScript で書かれているため型定義が利用可能

**pushover-notifications:**
```bash
npm install --save-dev @types/pushover-notifications
```
または独自の型定義を作成

#### 3.3 内部関数の型定義

```typescript
interface EventBody {
  accessToken: string;
  entryTitle: string;
  entryUrl: string;
  entryAuthor?: string;  // hatebu のみ
  entryContent?: string; // hatebu のみ
}

const getAccessToken = (eventBody: string): string => {
  // 実装
};

const postToMastodon = async (params: {
  status: string;
}): Promise<any> => {
  // 実装
};
```

### フェーズ4: 型安全性強化

#### 4.1 tsconfig.json の strict モード有効化

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

#### 4.2 型エラーの修正

strict モード有効化後に発生する型エラーを順次修正：

- null/undefined チェックの追加
- 型アサーションの適切な使用
- エラーハンドリングの型安全性向上

#### 4.3 ESLint + TypeScript 設定（オプション）

```bash
npm install --save-dev @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint
```

## 実行手順

### 1. フェーズ1の実行

```bash
# TypeScript 関連パッケージのインストール
cd github && npm install --save-dev typescript @types/node @types/aws-lambda
cd ../hatebu && npm install --save-dev typescript @types/node @types/aws-lambda

# ディレクトリ構造の準備
cd ../github && mkdir src && mv index.js src/index.ts
cd ../hatebu && mkdir src && mv index.js src/index.ts

# tsconfig.json とビルドスクリプトの追加
# （各ファイルを手動で作成）
```

### 2. フェーズ2の実行

```bash
# ビルドテスト
cd github && npm run build
cd ../hatebu && npm run build

# 全体ビルドテスト
cd .. && make build
```

### 3. フェーズ3の実行

- 段階的に型定義を追加
- 各段階でビルド・デプロイテストを実行

### 4. フェーズ4の実行

- strict モードを有効化
- 型エラーを順次修正

## 注意事項

1. **動作確認必須**: 各フェーズ完了後、実際にデプロイして動作確認を行うこと
2. **バックアップ**: 移行前に現在の動作状態をバックアップすること
3. **段階的実行**: 一度にすべてを変更せず、フェーズごとに確実に進めること
4. **依存関係**: 外部ライブラリの型定義が不完全な場合は、独自定義を作成すること

## 期待される効果

- **型安全性**: コンパイル時にエラーを検出
- **開発効率**: IDEでのコード補完・リファクタリング支援
- **保守性**: コードの可読性と保守性の向上
- **ドキュメント**: 型定義自体がドキュメントとして機能
