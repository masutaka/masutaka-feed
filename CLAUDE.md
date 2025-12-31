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

AWS SAMを使用したサーバーレスアプリケーション。構成図は @README.md の Features 参照。

### EventBridge Scheduler

定期的にLambda関数を起動するスケジューラー：

- **github-feed-subscriber-schedule**: 5分ごとにGitHubFeedSubscriberFunctionを起動
- **hatebu-feed-subscriber-schedule**: 15分ごとにHatebuFeedSubscriberFunctionを起動

各スケジューラーには専用のIAMロール（GitHubSchedulerRole、HatebuSchedulerRole）が設定され、対象のLambda関数のみを呼び出す権限を持つ。

### Lambda関数

すべてのLambda関数はNode.js 24（arm64アーキテクチャ）で動作。TypeScriptで実装されており、esbuildでビルドされる。

#### Subscriber関数
- **GitHubFeedSubscriberFunction**: GitHubフィード購読とDynamoDBでの重複チェック（タイムアウト: 60秒）
- **HatebuFeedSubscriberFunction**: はてブフィード購読とDynamoDBでの重複チェック（タイムアウト: 60秒）

#### Notifier関数
- **GitHubNotifierFunction**: Mastodon/Pushoverへの投稿（タイムアウト: 60秒）
- **HatebuNotifierFunction**: Mastodonへの投稿（タイムアウト: 60秒）

### DynamoDBテーブル

- **masutaka-feed-github-state**: GitHub処理済みエントリーを管理（TTL: 30日）
- **masutaka-feed-hatebu-state**: はてブ処理済みエントリーを管理（TTL: 30日）

### CloudWatchアラーム

すべてのLambda関数に対して以下の2種類のアラームを設定：

#### エラーアラーム
- **監視内容**: Lambda関数のエラー発生
- **通知先**: masutaka-feed-lambda-alarms SNSトピック
- **各関数の閾値**:
  - GitHubFeedSubscriber: 2回連続でエラー発生（5分間隔で評価）
  - HatebuFeedSubscriber: 1回以上のエラー（15分間隔で評価）
  - GitHubNotifier: 1回以上のエラー（15分間隔で評価）
  - HatebuNotifier: 1回以上のエラー（15分間隔で評価）

#### 実行時間アラーム
- **監視内容**: Lambda関数の平均実行時間
- **評価方法**: 2回連続で閾値を超えた場合に通知
- **各関数の閾値**:
  - GitHubFeedSubscriber: 10秒（5分間隔で評価）
  - HatebuFeedSubscriber: 20秒（15分間隔で評価）
  - GitHubNotifier: 30秒（15分間隔で評価）
  - HatebuNotifier: 20秒（15分間隔で評価）

## 主要コマンド

### ビルドとデプロイ

```bash
# 依存関係のインストール（全サブディレクトリのnpm install）
make setup

# TypeScriptとESLintのチェック
make lint

# ESLintによる自動修正
make fmt-eslint

# これからデプロイされるリソースを表示する
make list-resources

# SAMテンプレートの検証
make validate

# SAMビルド（esbuildでTypeScriptをトランスパイル）
make build

# SAMデプロイ
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
- **samconfig.toml**: SAMデプロイメント設定
  - スタック名、リージョン、S3バケットなどの設定
  - パラメータオーバーライドの管理
- **template.yaml**: アプリケーション全体の定義
  - Lambda関数（Feed Subscriber、Notifier）の設定
  - DynamoDBテーブル（GitHubStateTable、HatebuStateTable）の定義
  - EventBridge Schedulerの設定（5分/15分間隔）
  - IAMロールとポリシーの自動生成
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
- **GH_URL_IGNORE_REGEXP**: 無視するURLの正規表現パターン
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
- **TypeScript**: 型システム
- **ESLint**: コード品質チェック（@typescript-eslint/parser, @typescript-eslint/eslint-plugin）
- **esbuild**: 高速ビルドツール
- **@types/aws-lambda**, **@types/node**: 型定義
