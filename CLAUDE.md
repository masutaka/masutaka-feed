# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要事項

**コード実装後は、必ず以下の成功を確認すること：**

```bash
# TypeScriptとESLintのエラーがないことを確認
make lint
```

**サブディレクトリでコマンドを実行する場合は、サブシェルで実行し、実行後に自動的にリポジトリ直下に戻ること：**

```bash
(cd github/notifier && "any command")
```

## プロジェクト概要

AWS SAMを使用したサーバーレスアプリケーション。GitHubの活動とはてブのお気に入りをMastodonとPushover（Pushoverは一部のみ）に投稿する。

### アーキテクチャ

#### github/
- **EventBridge Scheduler** (5分ごと) → **Feed Subscriber Lambda** → **DynamoDB** → **Notifier Lambda** → **Mastodon/Pushover**
- GitHubプライベートフィードを取得し、新規エントリーをフィルタリングして投稿
- 正規表現フィルタリング機能付き（`GH_TITLE_IGNORE_REGEXP`、`GH_TITLE_PUSHOVER_REGEXP`）

#### hatebu/
- **EventBridge Scheduler** (15分ごと) → **Feed Subscriber Lambda** → **DynamoDB** → **Notifier Lambda** → **Mastodon**
- はてブお気に入りフィードを取得し、新規エントリーを投稿

詳細は @README.md の Features 参照。

### Lambda関数構成

各ディレクトリ（github/、hatebu/）には2つのLambda関数が含まれる：
- **subscriber/**: フィード購読とDynamoDBでの重複チェックを担当
- **notifier/**: 外部サービス（Mastodon、Pushover）への投稿を担当

すべてのLambda関数はNode.js 22（arm64アーキテクチャ）で動作。TypeScriptで実装されており、esbuildでビルドされる。

### DynamoDBテーブル

- **GitHubStateTable**: GitHub処理済みエントリーを管理（TTL: 30日）
- **HatebuStateTable**: はてブ処理済みエントリーを管理（TTL: 30日）

## 主要コマンド

### ビルドとデプロイ

```bash
# 依存関係のインストール（全サブディレクトリのnpm install）
make setup

# TypeScriptとESLintのチェック
make lint

# ESLintによる自動修正
make fmt-eslint

# SAMテンプレートの検証
make validate

# SAMビルド（esbuildでTypeScriptをトランスパイル）
make build

# デプロイ
make deploy
```

### 個別の依存関係管理

各Lambda関数は独立したディレクトリで管理：

```bash
# github/notifierでの作業
(cd github/notifier && make setup)

# github/subscriberでの作業
(cd github/subscriber && make setup)

# hatebu/notifierでの作業
(cd hatebu/notifier && make setup)

# hatebu/subscriberでの作業
(cd hatebu/subscriber && make setup)
```

## 開発のポイント

### AWS SAM（Serverless Application Model）
- **template.yaml**: アプリケーション全体の定義
  - Lambda関数（Feed Subscriber、Notifier）の設定
  - DynamoDBテーブル（GitHubStateTable、HatebuStateTable）の定義
  - EventBridge Schedulerの設定（5分/15分間隔）
  - IAMロールとポリシーの自動生成
- **samconfig.toml**: SAMデプロイメント設定
  - スタック名、リージョン、S3バケットなどの設定
  - パラメータオーバーライドの管理
- **ビルドプロセス**: esbuildを使用したTypeScriptのトランスパイル
  - `make build`でSAMビルドを実行
  - Lambda関数ごとに最適化されたバンドルを生成

### TypeScript設定
- TypeScriptで実装（`index.ts`）
- 厳密な型チェック（strict mode）有効
- esbuildによる高速トランスパイル
- 各Lambda関数は`index.handler`としてエクスポート

### 開発ワークフロー
- ESLint（Flat Config形式）による静的解析
- TypeScriptの型チェック（`make lint`）
- エラーハンドリングとCloudWatch Alarmsが設定済み

### 環境変数

#### GitHub関連
- **GH_FEED_URL**: GitHubプライベートフィードのURL（トークン付き）
- **GH_TITLE_IGNORE_REGEXP**: 無視するタイトルの正規表現パターン
- **GH_TITLE_PUSHOVER_REGEXP**: Pushoverに送信するタイトルの正規表現パターン

#### はてブ関連
- **HATEBU_FEED_URL**: はてブお気に入りフィードのURL（キー付き）

#### 外部サービス認証
- **PUSHOVER_APP_TOKEN**: Pushover APIのアプリケーショントークン
- **PUSHOVER_USER_KEY**: Pushover APIのユーザーキー
- **MASTODON_URL**: MastodonインスタンスのURL
- **MASTODON_ACCESS_TOKEN**: Mastodon APIのアクセストークン

## 依存関係

### プロダクション依存関係
- **masto**: Mastodon API クライアント（github/notifier、hatebu/notifierで使用）
- **pushover-notifications**: github/notifierでのみ使用
- **rss-parser**: RSSフィードのパース（github/subscriber、hatebu/subscriberで使用）
- **@aws-sdk/client-dynamodb**, **@aws-sdk/lib-dynamodb**: DynamoDBアクセス（github/subscriber、hatebu/subscriberで使用）
- **@aws-sdk/client-lambda**: Lambda関数呼び出し（github/subscriber、hatebu/subscriberで使用）

### 開発依存関係
- **TypeScript**: 5.8.3
- **ESLint**: 9.29.0（@typescript-eslint/parser, @typescript-eslint/eslint-plugin）
- **esbuild**: 0.25.5（ビルドツール）
- **@types/aws-lambda**, **@types/node**: 型定義

## CI/CD (GitHub Actions)

### テストワークフロー
- **トリガー**: mainブランチへのpush、Pull Request
- **実行内容**:
  - actionlint: GitHub Actions設定のチェック
  - CodeQL: セキュリティ脆弱性の検出
  - lint: TypeScriptとESLintによる静的解析（`make setup lint`）
  - 失敗時はPushover通知（mainブランチのみ）

### デプロイワークフロー
- **トリガー**: testワークフロー成功後（mainブランチのみ）
- **認証**: AWS OIDCによるセキュアな認証
- **デプロイ**: `make deploy`でSAMアプリケーションをデプロイ
- **リージョン**: ap-northeast-1（東京）

### その他のワークフロー
- **dependency_review**: PR時の依存関係脆弱性チェック
- **schedule**: 毎週金曜19:00（JST）にCodeQL分析を定期実行
