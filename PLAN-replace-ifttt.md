# IFTTT Pro 置換計画

## 現在のアーキテクチャ
- IFTTT ProがRSSフィードを定期的に監視
- 新規エントリーを検出するとWebhook経由でAPI Gatewayにプレーンテキストを送信
- Lambda関数が処理してMastodon/Pushoverに投稿

## AWS置換案（おすすめ順）

### 1. EventBridge Scheduler + Lambda（最推奨）

**概要**: EventBridge Schedulerで定期実行するRSSチェッカーLambda関数を作成

**メリット**:
- シンプルで管理しやすい
- cronやrateベースの柔軟なスケジューリング
- サーバーレスで完結
- 最小限のコスト（Lambda実行時間のみ）
- EventBridgeの高い信頼性

**実装方法**:
1. 新しいLambda関数 `rss-checker` を作成
   - GitHubとはてブのRSSフィードを取得
   - 前回チェック時刻をDynamoDBに保存
   - 新規エントリーを検出したら既存のLambda関数を直接呼び出し
2. EventBridge Schedulerで5分間隔で実行
3. DynamoDBテーブルで処理済みエントリーを管理

**推定コスト**: 月額 $1-2程度

### 2. Step Functions + EventBridge Scheduler

**概要**: Step FunctionsでRSSチェックワークフローを定義し、EventBridge Schedulerで定期実行

**メリット**:
- 処理フローの可視化
- エラーハンドリングが強力
- リトライロジックが組み込み済み
- 並列処理が簡単

**実装方法**:
1. Step Functionsで以下のワークフローを定義
   - RSS取得ステップ
   - 新規エントリー判定ステップ
   - 既存Lambda呼び出しステップ（並列実行）
2. EventBridge Schedulerで定期実行

**推定コスト**: 月額 $2-5程度（Step Functions実行料金追加）

### 3. ECS Fargate + EventBridge Scheduler

**概要**: コンテナベースのRSSチェッカーをFargateで実行

**メリット**:
- 任意の言語/ライブラリが使用可能
- 複雑なRSS処理ロジックに対応しやすい
- CPUやメモリを柔軟に設定可能

**実装方法**:
1. RSSチェッカーのDockerイメージを作成
2. ECSタスク定義を作成
3. EventBridge SchedulerでECSタスクを定期実行
4. タスクから既存Lambda関数を呼び出し

**推定コスト**: 月額 $5-10程度（Fargate実行時間による）

### 4. CloudWatch Events + Lambda（非推奨）

**概要**: CloudWatch Events（レガシー）でLambdaを定期実行

**メリット**:
- シンプルな実装

**デメリット**:
- EventBridge Schedulerの方が新しく機能豊富
- CloudWatch Eventsは将来的に非推奨になる可能性

### 5. AWS Batch（非推奨）

**概要**: バッチジョブとしてRSSチェックを実行

**デメリット**:
- オーバースペック
- 管理が複雑
- コストが高い

## 実装詳細（案1: EventBridge Scheduler + Lambda）

### 新規作成するリソース

1. **Lambda関数: `rss-checker`**
   ```typescript
   // RSS取得とパース
   // DynamoDBで既読管理
   // 新規エントリーを検出したら既存Lambda関数を直接呼び出し
   ```

2. **DynamoDBテーブル: `rss-feed-state`**
   - パーティションキー: `feed_url`
   - ソートキー: `entry_id`
   - 属性: `processed_at`, `entry_data`

3. **EventBridge Schedulerルール**
   - スケジュール: `rate(5 minutes)`
   - ターゲット: `rss-checker` Lambda関数

### 移行手順

1. DynamoDBテーブルを作成
2. rss-checker Lambda関数を実装・デプロイ
3. EventBridge Schedulerを設定
4. IFTTT Proと並行稼働でテスト
5. 問題なければIFTTT Proを停止
6. API GatewayのエンドポイントをLambda間直接呼び出しに変更（オプション）

### セキュリティ改善

- API Gateway経由ではなくLambda間の直接呼び出しに変更可能
- IAMロールベースの認証でよりセキュア
- MY_ACCESS_TOKENが不要になる

## まとめ

EventBridge Scheduler + Lambdaの組み合わせが最もシンプルで管理しやすく、コスト効率も良いため推奨します。将来的な拡張性も考慮すると、Step Functionsを使用する案も検討の価値があります。