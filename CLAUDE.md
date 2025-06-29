# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

AWS SAMを使用したサーバーレスアプリケーション。GitHubの活動とはてブのお気に入りをMastodonとPushover（Pushoverは一部のみ）に投稿する。

### アーキテクチャ

- **github/**: GitHub活動フィードを処理するLambda関数
  - IFTTT Pro → Amazon API Gateway → AWS Lambda → Mastodon/Pushover
  - 正規表現フィルタリング機能付き
- **hatebu/**: はてブお気に入りを処理するLambda関数
  - IFTTT Pro → Amazon API Gateway → AWS Lambda → Mastodon

両方の関数は独立したNode.js 22 Lambda関数として動作。TypeScriptで実装されており、esbuildでビルドされる。

## 主要コマンド

### ビルドとデプロイ

```bash
# 依存関係のインストール（github/, hatebu/のnpm install含む）
make setup

# TypeScriptとESLintのチェック
make lint

# ESLintによる自動修正
make fmt-eslint

# SAMビルド（esbuildでTypeScriptをトランスパイル）
make build

# デプロイ（環境変数必要）
make deploy
```

### 個別の依存関係管理

```bash
# github/配下での作業
cd github && make setup

# hatebu/配下での作業
cd hatebu && make setup
```

## 開発のポイント

### TypeScript設定
- TypeScriptで実装（`index.ts`）
- 厳密な型チェック（strict mode）有効
- esbuildによる高速トランスパイル
- 各Lambda関数は`index.handler`としてエクスポート

### 開発ワークフロー
- ESLint（Flat Config形式）による静的解析
- TypeScriptの型チェック（`make lint`）
- 環境変数は`template.yaml`で管理
- エラーハンドリングとCloudWatch Alarmsが設定済み
- デプロイは`main`ブランチへのpushで自動実行
- `samconfig.toml`でSAM設定管理

## 依存関係

### プロダクション依存関係
- **masto**: Mastodon API クライアント（両方の関数で使用）
- **pushover-notifications**: github/関数でのみ使用

### 開発依存関係
- **TypeScript**: 5.8.3
- **ESLint**: 9.29.0（@typescript-eslint/parser, @typescript-eslint/eslint-plugin）
- **esbuild**: 0.25.5（ビルドツール）
- **@types/aws-lambda**, **@types/node**: 型定義
