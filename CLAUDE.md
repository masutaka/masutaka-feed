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

両方の関数は独立したNode.js 22 Lambda関数として動作。

## 主要コマンド

### ビルドとデプロイ

```bash
# 全体のビルド（github/, hatebu/のnpm installも含む）
make build

# 各関数の依存関係インストール
make github
make hatebu

# デプロイ（環境変数必要）
make deploy
```

### 個別の依存関係管理

```bash
# github/配下での作業
cd github && npm install

# hatebu/配下での作業
cd hatebu && npm install
```

## 開発のポイント

- 各Lambda関数は`index.js`のexports.handlerとしてエクスポート
- 環境変数は`template.yaml`で管理
- エラーハンドリングとCloudWatch Alarmsが設定済み
- デプロイは`main`ブランチへのpushで自動実行
- `samconfig.toml`でSAM設定管理

## 依存関係

- **masto**: Mastodon API クライアント（両方の関数で使用）
- **pushover-notifications**: github/関数でのみ使用
