# IFTTT Pro 置換実装計画 v2 - EventBridge Scheduler + Lambda

## 概要

IFTTTを使用したRSSフィード監視をAWSネイティブのソリューションに置換する。EventBridge SchedulerでLambda関数を定期実行し、RSSフィードから新規エントリーを検出してMastodon/Pushoverに投稿する。

## 新アーキテクチャ詳細

### システム全体図

```
[EventBridge Scheduler]
    ↓ (5分間隔)
[RSS Checker Lambda]
    ├─→ [DynamoDB] (処理済みエントリー管理)
    ├─→ [GitHub RSS Feed]
    ├─→ [はてブ RSS Feed]  
    ↓ (新規エントリー検出時)
[既存Lambda関数]
    ├─→ [GitHub Function] → [Mastodon/Pushover]
    └─→ [Hatebu Function] → [Mastodon]
```

### コンポーネント詳細

#### 1. RSS Checker Lambda関数 (`rss-checker/`)

**責務**:
- GitHubとはてブのRSSフィードを取得
- 新規エントリーの検出  
- 既存Lambda関数の呼び出し
- 処理状態の管理

**環境変数**:
```yaml
GITHUB_RSS_URL: "https://github.com/masutaka.private.atom?token=XXX"
HATEBU_RSS_URL: "https://b.hatena.ne.jp/masutaka/rss"
STATE_TABLE_NAME: "masutaka-feed-rss-state"
GITHUB_FUNCTION_ARN: !GetAtt GithubFunction.Arn
HATEBU_FUNCTION_ARN: !GetAtt HatebuFunction.Arn
```

**実装詳細**:
```typescript
// index.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import Parser from 'rss-parser';

interface RSSEntry {
  id: string;
  title: string;
  link: string;
  author?: string;
  content?: string;
  pubDate?: string;
}

interface ProcessedEntry {
  feed_url: string;
  entry_id: string;
  processed_at: number;
  entry_data: RSSEntry;
}

// RSS解析とエントリー処理
async function processRSSFeed(feedUrl: string, feedType: 'github' | 'hatebu'): Promise<void> {
  const parser = new Parser();
  const feed = await parser.parseURL(feedUrl);
  
  for (const item of feed.items) {
    const isNew = await checkIfNewEntry(feedUrl, item.guid || item.link);
    
    if (isNew) {
      await invokeTargetLambda(feedType, item);
      await markAsProcessed(feedUrl, item);
    }
  }
}

// 既存Lambda関数の呼び出し
async function invokeTargetLambda(feedType: 'github' | 'hatebu', item: any): Promise<void> {
  const lambda = new LambdaClient({});
  
  if (feedType === 'github') {
    const payload = formatGitHubPayload(item);
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.GITHUB_FUNCTION_ARN,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload))
    }));
  } else {
    const payload = formatHatebuPayload(item);
    await lambda.send(new InvokeCommand({
      FunctionName: process.env.HATEBU_FUNCTION_ARN,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload))
    }));
  }
}
```

#### 2. DynamoDBテーブル設計 (`masutaka-feed-rss-state`)

**テーブル構造**:
```yaml
TableName: masutaka-feed-rss-state
BillingMode: PAY_PER_REQUEST
KeySchema:
  - AttributeName: feed_url      # パーティションキー
    KeyType: HASH
  - AttributeName: entry_id       # ソートキー
    KeyType: RANGE
```

**アイテム例**:
```json
{
  "feed_url": "https://github.com/masutaka.private.atom?token=XXX",
  "entry_id": "tag:github.com,2008:PushEvent/123456789",
  "processed_at": 1703980800,
  "entry_data": {
    "title": "masutaka pushed to main in masutaka/repo",
    "link": "https://github.com/masutaka/repo/compare/abc...def",
    "pubDate": "2024-01-01T00:00:00Z"
  },
  "ttl": 1704585600  // 7日後に自動削除
}
```

**インデックス設計**:
- GSI不要（feed_urlでのクエリのみ）
- TTL有効化（古いエントリーの自動削除）

#### 3. EventBridge Scheduler設定

```yaml
ScheduleExpression: "rate(5 minutes)"
Target:
  Arn: !GetAtt RssCheckerFunction.Arn
  RoleArn: !GetAtt EventBridgeSchedulerRole.Arn
FlexibleTimeWindow:
  Mode: "OFF"
State: "ENABLED"
```

#### 4. 既存Lambda関数の修正

**インターフェース変更**:
- 現在: API Gateway経由でテキスト形式のbodyを受信
- 新規: Lambda直接呼び出しでJSON形式のeventを受信

```typescript
// github/index.ts の修正
export const handler = async (event: APIGatewayProxyEvent | DirectInvokeEvent, context: Context) => {
  // 呼び出し元の判定
  const isDirect = !event.hasOwnProperty('httpMethod');
  
  if (isDirect) {
    // Lambda直接呼び出しの場合
    const { entryTitle, entryUrl } = event as DirectInvokeEvent;
    return await processEntry(entryTitle, entryUrl);
  } else {
    // API Gateway経由の場合（既存処理）
    // ... 既存のコード
  }
};

interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}
```

### セキュリティ設計

#### IAMロール設計

**RSS Checker Lambda用ロール**:
```yaml
Policies:
  - DynamoDBReadWrite:
      - !GetAtt RssStateTable.Arn
  - LambdaInvoke:
      - !GetAtt GithubFunction.Arn
      - !GetAtt HatebuFunction.Arn
  - CloudWatchLogs
```

**EventBridge Scheduler用ロール**:
```yaml
Policies:
  - LambdaInvoke:
      - !GetAtt RssCheckerFunction.Arn
```

#### シークレット管理

- RSS URLのトークンはSSM Parameter Storeで管理
- 環境変数には参照のみ設定

```yaml
Environment:
  Variables:
    GITHUB_RSS_URL: !Sub "{{resolve:ssm:/masutaka-feed/github-rss-url}}"
    HATEBU_RSS_URL: !Sub "{{resolve:ssm:/masutaka-feed/hatebu-rss-url}}"
```

### エラーハンドリングとモニタリング

#### リトライ戦略

1. **RSS取得エラー**: 3回リトライ（指数バックオフ）
2. **DynamoDB操作エラー**: SDK標準リトライ
3. **Lambda呼び出しエラー**: 2回リトライ

#### CloudWatch Alarms

```yaml
RssCheckerErrorAlarm:
  MetricName: Errors
  Statistic: Sum
  Period: 300
  EvaluationPeriods: 1
  Threshold: 1

RssCheckerDurationAlarm:
  MetricName: Duration
  Statistic: Average
  Period: 300
  EvaluationPeriods: 2
  Threshold: 30000  # 30秒
```

#### ロギング

構造化ログの実装:
```typescript
const logger = {
  info: (message: string, meta?: any) => console.log(JSON.stringify({ level: 'INFO', message, ...meta })),
  error: (message: string, error?: any, meta?: any) => console.error(JSON.stringify({ level: 'ERROR', message, error: error?.message, stack: error?.stack, ...meta }))
};
```

## 実装計画

### Phase 1: 基盤構築（1週目）

1. **Day 1-2**: プロジェクト構造作成
   - [ ] `rss-checker/` ディレクトリ作成
   - [ ] TypeScript環境セットアップ
   - [ ] 必要な依存関係インストール

2. **Day 3-4**: DynamoDB構築
   - [ ] テーブル定義をtemplate.yamlに追加
   - [ ] TTL設定
   - [ ] 手動テスト用スクリプト作成

3. **Day 5**: RSS Checker基本実装
   - [ ] RSS取得ロジック
   - [ ] DynamoDB操作関数
   - [ ] ユニットテスト作成

### Phase 2: 統合実装（2週目）

4. **Day 6-7**: Lambda間連携
   - [ ] 既存Lambda関数の修正
   - [ ] 直接呼び出しインターフェース実装
   - [ ] 後方互換性の確保

5. **Day 8-9**: EventBridge設定
   - [ ] Scheduler定義追加
   - [ ] IAMロール設定
   - [ ] 手動実行テスト

6. **Day 10**: エラーハンドリング
   - [ ] リトライロジック実装
   - [ ] エラー通知設定
   - [ ] CloudWatch Alarms追加

### Phase 3: テストと移行（3週目）

7. **Day 11-12**: 統合テスト
   - [ ] エンドツーエンドテスト
   - [ ] 負荷テスト（大量エントリー）
   - [ ] 障害シナリオテスト

8. **Day 13**: 並行稼働
   - [ ] IFTTTと新システムの並行稼働
   - [ ] 重複投稿防止の確認
   - [ ] メトリクス比較

9. **Day 14**: 切り替え
   - [ ] IFTTT停止
   - [ ] 最終動作確認
   - [ ] ドキュメント更新

### Phase 4: 最適化（4週目）

10. **Day 15-16**: パフォーマンス改善
    - [ ] Lambda関数のメモリ最適化
    - [ ] DynamoDBクエリ最適化
    - [ ] コールドスタート対策

11. **Day 17-18**: コスト最適化
    - [ ] 実行頻度の調整検討
    - [ ] リソース使用量分析
    - [ ] 不要リソースの削除

## コスト試算

### 月間コスト概算

| リソース | 使用量 | 単価 | 月額 |
|---------|--------|------|------|
| Lambda実行 | 8,640回 × 1秒 | $0.0000166667/GB秒 | $0.14 |
| Lambda呼び出し | 8,640回 | $0.20/100万回 | $0.002 |
| DynamoDB書き込み | 1,000回 | $1.25/100万回 | $0.001 |
| DynamoDB読み取り | 8,640回 | $0.25/100万回 | $0.002 |
| DynamoDBストレージ | 1GB | $0.25/GB | $0.25 |
| EventBridge Scheduler | 8,640回 | $1.00/100万回 | $0.009 |
| **合計** | | | **約$0.40** |

## リスクと対策

### 技術的リスク

1. **RSSフィード形式変更**
   - 対策: パーサーの柔軟な実装、エラー通知

2. **大量エントリーによる処理遅延**
   - 対策: 並列処理、タイムアウト設定

3. **DynamoDB整合性問題**
   - 対策: 条件付き書き込み、重複チェック強化

### 運用リスク

1. **IFTTT停止時の取りこぼし**
   - 対策: 並行稼働期間の設定、初回実行時の過去分取得

2. **コスト超過**
   - 対策: Budget Alerts設定、実行頻度の動的調整

## 成功基準

- [ ] 全てのRSSエントリーが確実に処理される
- [ ] 重複投稿が発生しない
- [ ] エラー率が0.1%未満
- [ ] 平均処理時間が5秒以内
- [ ] 月間コストが$1以内

## 次のステップ

1. この計画のレビューと承認
2. 開発環境の準備
3. Phase 1の実装開始