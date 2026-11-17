# AGENTS.md

## 重要事項

**コード実装後は、必ず以下のコマンドが成功することを確認すること：**

```bash
# TypeScriptとESLintのエラーがないことを確認
make lint
```

**サブディレクトリでコマンドを実行する場合は、サブシェルで実行し、実行後に自動的にリポジトリ直下に戻ること：**

```bash
(cd github/notifier && "any command")
```

## プロジェクト概要

AWS SAMを使用したサーバーレスアプリケーション。構成図は @README.md 参照。

### EventBridge Scheduler

定期的にLambda関数を起動するスケジューラー：

- `github-feed-subscriber-schedule`: 5分ごとにGitHubFeedSubscriberFunctionを起動
- `hatebu-feed-subscriber-schedule`: 15分ごとにHatebuFeedSubscriberFunctionを起動

各スケジューラーには専用のIAMロール（GitHubSchedulerRole、HatebuSchedulerRole）が設定され、対象のLambda関数のみを呼び出す権限を持つ。

### Lambda関数

すべてのLambda関数はNode.js 24（arm64アーキテクチャ）で動作。TypeScriptで実装されており、esbuildでビルドされる。

#### Subscriber関数
- `GitHubFeedSubscriberFunction`: GitHubフィード購読とDynamoDBでの重複チェック、新着エントリーを古い順にSQSへ送信（タイムアウト: 60秒）
- `HatebuFeedSubscriberFunction`: はてブフィード購読とDynamoDBでの重複チェック、新着エントリーを古い順にSQSへ送信（タイムアウト: 60秒）

#### Notifier関数
- `GitHubNotifierFunction`: SQSから起動され、Mastodon/Pushoverへ投稿（タイムアウト: 75秒）
  - スターと公開（made this repository public）のイベントでは、README から Amazon Bedrock の Claude Haiku で紹介文を作り、Mastodon への投稿に添える（`github/notifier/introduction.ts`）
- `HatebuNotifierFunction`: SQSから起動され、Mastodonへ投稿（タイムアウト: 60秒）

### SQSキュー

SubscriberとNotifierの間をGitHub用・はてブ用それぞれのFIFOキューでつなぎ、エントリーを古い順に投稿する。

MessageGroupIdをキューごとに固定して全体の順序を保つため、失敗したメッセージがDLQに移るまで後続のメッセージは処理されない。順序を守るための仕様として受け入れている。

### DynamoDBテーブル

- `github-state`: GitHub処理済みエントリーを管理（TTL: 30日）
- `hatebu-state`: はてブ処理済みエントリーを管理（TTL: 30日）

### CloudWatchアラーム

Subscriber関数のエラーと、DLQへのメッセージの到着を監視する：

- 通知先: lambda-alarms SNSトピック
- Subscriber関数の閾値:
  - GitHubFeedSubscriber: 6回連続でエラー発生（5分間隔で評価 = 約30分）
  - HatebuFeedSubscriber: 3回連続でエラー発生（15分間隔で評価 = 約45分）

外部フィードの一時的な5xxなど、次回実行で自然復旧する単発の失敗を通知しない設計。

Notifier関数のエラーは監視しない。一時的な失敗はSQSの再試行で復旧し、失敗し続けたメッセージはDLQに移ってDLQのアラームで通知されるため。

DLQのアラームは、DLQにメッセージが残っている間はALARMのままなので、次にDLQに移ったメッセージは通知されない。通知を受けたら、DLQのメッセージを元のキューに戻すか削除して、DLQを空にする。元のキューに戻したメッセージはキューの末尾に入るため、投稿は古い順にならない。

### スター・公開されたリポジトリの紹介文

`GitHubNotifierFunction` は、スターと公開のイベントのときだけ次のように紹介文を作る。

- README は `https://raw.githubusercontent.com/{owner}/{repo}/HEAD/README.md` から未認証で取得する。owner/repo はタイトルではなく URL から取り出す
- README は 16 KiB で読み取りをやめ、資料として区切って渡す。区切りのタグ名には呼び出しごとのランダムな値を入れ、README 側から閉じられないようにする
- README は第三者が書けるため、プロンプトインジェクションを前提にする
  - GitHub の表示では見えない指示を手軽に仕込めないよう、HTML コメントは取り除いてから渡す。ただし、表示されない書き方はほかにもある
  - 出力の検証で防げるのは、リンク・メンション・ハッシュタグなどの形式まで。README に書かれた指示にモデルが従えば、誤解を招く文が投稿されることはありうる
- モデルは `global.anthropic.claude-haiku-4-5-20251001-v1:0`（Global cross-Region inference）。Claude Haiku 5.5 がこのアカウントではまだ使えないための代わりで、使えるようになったら Claude Haiku 5.5 にする（#295）。`template.yaml` の `Mappings` で定義し、IAM では必要な3つの ARN だけを許可する
- README・Bedrock・Mastodon・Pushover の呼び出しにタイムアウトを設け、Lambda の Timeout（75秒）に収める。Lambda 全体がタイムアウトすると、紹介なしで投稿するフォールバックが働かないため
- 投稿の形は `[GH] {紹介文} > {タイトル} {URL}`。紹介なしのときは、ほかのイベントと同じ `[GH] {タイトル} {URL}`
- 次の場合は紹介なしで投稿し、理由をログに出す
  - `README.md` がない（HTML コメントを除くと空の場合も含む）、README の取得に失敗した、Bedrock の呼び出しに失敗した
  - 前後の空白を除いた生成文が空・120字を超える・途中で途切れた、またはメンション・Mastodon でリンクになる URL・ハッシュタグ・カスタム絵文字・不等号（`<` `>`）・改行・制御文字を含む
  - 想定外の例外が出た
  - 紹介文を足すと Mastodon の500文字制限（URL は23字換算）を超える
- Pushover への送信内容は変えない
- 紹介文を作れない状態（Bedrock の失敗など）が続いても、自動では通知しない。趣味の機能で、紹介なしで投稿されるだけのため。最初の紹介付きの投稿は、デプロイ後にログで確かめる

### 予算アラーム

`MonthlyCostBudget` は、アカウント全体の月の費用が $10 を超えたとき（実績と予測）に lambda-alarms SNS トピックへ通知する。専用の AWS アカウントのため、アカウント全体を対象にしている。

lambda-alarms のトピックポリシー（`LambdaAlarmTopicPolicy`）はデフォルトのポリシーを置き換えるため、CloudWatch アラームと Budgets の両方に publish を許可している。片方を消すと、その通知が届かなくなる。

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

# SAMデプロイ（先に make build が必要）
make deploy

# GitHub Actionsのデプロイ用IAMロールとOIDCプロバイダーのデプロイ（ローカルから手動で実行）
make deploy-bootstrap
```

### bootstrapスタック

`bootstrap.yaml` は、GitHub Actionsのデプロイ用IAMロール（`github-actions`）とOIDCプロバイダーを定義する。

- デプロイ用ロールは、そのロール自身ではデプロイできないため、`template.yaml` とは別スタック（`bootstrap`）にしている
- GitHub Actionsのデプロイでは更新しない。変更したら、管理者権限で `make deploy-bootstrap` を実行する
- ただしロールは `AdministratorAccess` を持つため、ロールが自分の権限を書き換えること自体は防げない

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
- `samconfig.toml`: SAMデプロイメント設定
  - スタック名、リージョン、S3バケットなどの設定
  - パラメータオーバーライドの管理
- `template.yaml`: アプリケーション全体の定義
  - Lambda関数（Feed Subscriber、Notifier）の設定
  - SQS FIFOキュー（GitHubQueue、HatebuQueue）とDLQの定義
  - DynamoDBテーブル（GitHubStateTable、HatebuStateTable）の定義
  - Bedrock のモデル（`Mappings`）と予算アラーム（MonthlyCostBudget）の定義
  - EventBridge Schedulerの設定（5分/15分間隔）
  - IAMロールとポリシーの自動生成
- ビルドプロセス: esbuildを使用したTypeScriptのトランスパイル
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
- エラーハンドリングを実装済みで、CloudWatchアラームも設定済み

### 環境変数

#### GitHub関連
- `GH_FEED_URL`: GitHubプライベートフィードのURL（トークン付き）
- `GH_TITLE_IGNORE_REGEXP`: 無視するタイトルの正規表現パターン
- `GH_URL_IGNORE_REGEXP`: 無視するURLの正規表現パターン
- `GH_TITLE_PUSHOVER_REGEXP`: Pushoverに送信するタイトルの正規表現パターン

#### はてブ関連
- `HATEBU_FEED_URL`: はてブお気に入りフィードのURL（キー付き）

#### 外部サービス認証
- `PUSHOVER_APP_TOKEN`: Pushover APIのアプリケーショントークン
- `PUSHOVER_USER_KEY`: Pushover APIのユーザーキー
- `MASTODON_URL`: MastodonインスタンスのURL
- `MASTODON_ACCESS_TOKEN`: Mastodon APIのアクセストークン

## 依存関係

### プロダクション依存関係
- `masto`: Mastodon API クライアント（github/notifier、hatebu/notifierで使用）
- `rss-parser`: RSSフィードのパース（github/subscriber、hatebu/subscriberで使用）
- `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`: DynamoDBアクセス（github/subscriber、hatebu/subscriberで使用）
- `@aws-sdk/client-sqs`: SQSへのメッセージ送信（github/subscriber、hatebu/subscriberで使用）
- `@aws-sdk/client-bedrock-runtime`: Amazon Bedrock の呼び出し（github/notifierで使用）

### 開発依存関係
- TypeScript: 型システム
- ESLint: コード品質チェック（@typescript-eslint/parser, @typescript-eslint/eslint-plugin）
- `esbuild`: 高速ビルドツール
- `@types/aws-lambda`, `@types/node`: 型定義
