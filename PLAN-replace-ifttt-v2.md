# IFTTT Pro 置換実装計画 v2 - EventBridge Scheduler + Lambda

## 概要

IFTTTを使用したフィード監視をAWSネイティブのソリューションに置換する。EventBridge SchedulerでLambda関数を定期実行し、フィードから新規エントリーを検出してMastodon/Pushoverに投稿する。

## 新アーキテクチャ詳細

### システム全体図

```
[EventBridge Scheduler (5分間隔)]
    ↓
[GitHub Feed Subscriber Lambda]
    ├─→ [DynamoDB] (処理済みエントリー管理)
    ├─→ [GitHub Feed]
    └─→ [GitHub Function] → [Mastodon/Pushover]

[EventBridge Scheduler (15分間隔)]
    ↓
[Hatebu Feed Subscriber Lambda]
    ├─→ [DynamoDB] (処理済みエントリー管理)
    ├─→ [はてブ Feed]
    └─→ [Hatebu Function] → [Mastodon]
```

### コンポーネント詳細

#### 1. Feed Subscriber Lambda関数

##### 1-1. GitHub Feed Subscriber Lambda関数 (`github/subscriber/`)

**責務**:
- GitHub フィードを購読・取得
- 新規エントリーの検出  
- GitHub Lambda関数の呼び出し
- 処理状態の管理

**環境変数**:
```yaml
FEED_URL: "https://github.com/masutaka.private.atom?token=XXXX"
STATE_TABLE_NAME: "masutaka-feed-github-state"
TARGET_FUNCTION_ARN: !GetAtt GithubFunction.Arn
```

##### 1-2. Hatebu Feed Subscriber Lambda関数 (`hatebu/subscriber/`)

**責務**:
- はてブフィードを購読・取得
- 新規エントリーの検出  
- Hatebu Lambda関数の呼び出し
- 処理状態の管理

**環境変数**:
```yaml
FEED_URL: !Ref HatebuFeedUrl  # CloudFormationパラメータから取得
STATE_TABLE_NAME: "masutaka-feed-hatebu-state"
TARGET_FUNCTION_ARN: !GetAtt HatebuFunction.Arn
```

**実装詳細**:

### フィード形式の違いへの対応

実際のフィードを確認した結果、以下の違いがあります：

- **GitHub**: Atom形式（`<entry>`要素、`<id>`要素）
- **はてブ**: RSS 1.0/RDF形式（`<item>`要素、`rdf:about`属性）

`rss-parser`ライブラリは両形式に対応していますが、フィールドマッピングが異なるため、各Lambda関数で独立した実装とします。共通化は動作確認後のリファクタリングフェーズで検討します。

##### GitHub Feed Subscriber実装 (`github/subscriber/index.ts`)
```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import Parser from 'rss-parser';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambdaClient = new LambdaClient({});

export const handler = async (): Promise<void> => {
  const parser = new Parser<{}, GitHubFeedItem>();
  const feed = await parser.parseURL(process.env.FEED_URL!);
  
  for (const item of feed.items) {
    const entryId = item.id || item.guid || item.link!;
    const isNew = await checkIfNewEntry(entryId);
    
    if (isNew) {
      const payload = {
        entryTitle: item.title || '',
        entryUrl: item.link || ''
      };
      
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.TARGET_FUNCTION_ARN!,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(payload))
      }));
      
      await markAsProcessed(entryId, item);
    }
  }
};

async function checkIfNewEntry(entryId: string): Promise<boolean> {
  const result = await dynamoClient.send(new GetCommand({
    TableName: process.env.STATE_TABLE_NAME!,
    Key: { entry_id: entryId }
  }));
  return !result.Item;
}

async function markAsProcessed(entryId: string, item: any): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dynamoClient.send(new PutCommand({
    TableName: process.env.STATE_TABLE_NAME!,
    Item: {
      entry_id: entryId,
      processed_at: now,
      entry_data: item,
      ttl: now + (30 * 24 * 60 * 60)  // 30日後に削除
    }
  }));
}

interface GitHubFeedItem {
  id?: string;
  guid?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  // Atom特有のフィールド
  published?: string;
  updated?: string;
}
```

##### Hatebu Feed Subscriber実装 (`hatebu/subscriber/index.ts`)
```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import Parser from 'rss-parser';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambdaClient = new LambdaClient({});

export const handler = async (): Promise<void> => {
  const parser = new Parser<{}, HatebuFeedItem>();
  const feed = await parser.parseURL(process.env.FEED_URL!);
  
  for (const item of feed.items) {
    const entryId = item.guid || item.link!;
    const isNew = await checkIfNewEntry(entryId);
    
    if (isNew) {
      const payload = {
        entryAuthor: item.creator || item['dc:creator'] || '',
        entryTitle: item.title || '',
        entryUrl: item.link || '',
        entryContent: item['content:encoded'] || item.contentSnippet || ''
      };
      
      await lambdaClient.send(new InvokeCommand({
        FunctionName: process.env.TARGET_FUNCTION_ARN!,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(payload))
      }));
      
      await markAsProcessed(entryId, item);
    }
  }
};

async function checkIfNewEntry(entryId: string): Promise<boolean> {
  const result = await dynamoClient.send(new GetCommand({
    TableName: process.env.STATE_TABLE_NAME!,
    Key: { entry_id: entryId }
  }));
  return !result.Item;
}

async function markAsProcessed(entryId: string, item: any): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await dynamoClient.send(new PutCommand({
    TableName: process.env.STATE_TABLE_NAME!,
    Item: {
      entry_id: entryId,
      processed_at: now,
      entry_data: item,
      ttl: now + (30 * 24 * 60 * 60)  // 30日後に削除
    }
  }));
}

interface HatebuFeedItem {
  guid?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  'content:encoded'?: string;
  contentSnippet?: string;
  // RSS 1.0/RDF特有のフィールド
  'dc:creator'?: string;
  'dc:date'?: string;
}
```

#### 2. DynamoDBテーブル設計

##### 2-1. GitHub用テーブル (`masutaka-feed-github-state`)

**テーブル構造**:
```yaml
GitHubStateTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: masutaka-feed-github-state
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: entry_id      # パーティションキー
        KeyType: HASH
    AttributeDefinitions:
      - AttributeName: entry_id
        AttributeType: S
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
```

##### 2-2. はてブ用テーブル (`masutaka-feed-hatebu-state`)

**テーブル構造**:
```yaml
HatebuStateTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: masutaka-feed-hatebu-state
    BillingMode: PAY_PER_REQUEST
    KeySchema:
      - AttributeName: entry_id      # パーティションキー
        KeyType: HASH
    AttributeDefinitions:
      - AttributeName: entry_id
        AttributeType: S
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
```

**GitHubテーブルのアイテム例**:
```json
{
  "entry_id": "tag:github.com,2008:PushEvent/123456789",
  "processed_at": 1703980800,
  "entry_data": {
    "title": "masutaka pushed to main in masutaka/repo",
    "link": "https://github.com/masutaka/repo/compare/abc...def",
    "pubDate": "2024-01-01T00:00:00Z"
  },
  "ttl": 1706572800  // 30日後に自動削除
}
```

**はてブテーブルのアイテム例**:
```json
{
  "entry_id": "https://b.hatena.ne.jp/masutaka/20240101#bookmark-123456",
  "processed_at": 1703980800,
  "entry_data": {
    "title": "興味深い記事のタイトル",
    "link": "https://example.com/article",
    "author": "masutaka",
    "content": "コメント内容...",
    "pubDate": "2024-01-01T00:00:00Z"
  },
  "ttl": 1706572800  // 30日後に自動削除
}
```

**テーブル分割の利点**:
- アクセスパターンの違いに対応可能
- 権限の分離（最小権限の原則）
- モニタリングの明確化
- 将来のスキーマ変更の柔軟性

#### 3. EventBridge Scheduler設定

##### GitHub用Scheduler
```yaml
GitHubFeedScheduler:
  Type: AWS::Scheduler::Schedule
  Properties:
    Name: github-feed-subscriber-schedule
    ScheduleExpression: "rate(5 minutes)"
    Target:
      Arn: !GetAtt GitHubFeedSubscriberFunction.Arn
      RoleArn: !GetAtt GitHubSchedulerRole.Arn
    FlexibleTimeWindow:
      Mode: "OFF"
    State: "ENABLED"
```

##### Hatebu用Scheduler
```yaml
HatebuFeedScheduler:
  Type: AWS::Scheduler::Schedule
  Properties:
    Name: hatebu-feed-subscriber-schedule
    ScheduleExpression: "rate(15 minutes)"
    Target:
      Arn: !GetAtt HatebuFeedSubscriberFunction.Arn
      RoleArn: !GetAtt HatebuSchedulerRole.Arn
    FlexibleTimeWindow:
      Mode: "OFF"
    State: "ENABLED"
```

#### 4. 既存Lambda関数の修正

**インターフェース変更**:
- 現在: API Gateway経由でテキスト形式のbodyを受信
- 新規: Lambda直接呼び出しでJSON形式のeventを受信（後方互換性は考慮しない）

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
    // API Gateway経由の場合（後方互換性を残す場合のみ）
    // ... 既存のコード
  }
};

interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}

// hatebu/index.ts の修正
export const handler = async (event: APIGatewayProxyEvent | DirectInvokeEvent, context: Context) => {
  // 呼び出し元の判定
  const isDirect = !event.hasOwnProperty('httpMethod');
  
  if (isDirect) {
    // Lambda直接呼び出しの場合
    const { entryAuthor, entryTitle, entryUrl, entryContent } = event as DirectInvokeEvent;
    return await processEntry(entryAuthor, entryTitle, entryUrl, entryContent);
  } else {
    // API Gateway経由の場合（後方互換性を残す場合のみ）
    // ... 既存のコード
  }
};

interface DirectInvokeEvent {
  entryAuthor: string;
  entryTitle: string;
  entryUrl: string;
  entryContent: string;
}
```

### セキュリティ設計

#### IAMロール設計

**GitHub Feed Subscriber Lambda用ロール**:
```yaml
GitHubFeedSubscriberRole:
  Policies:
    - DynamoDBReadWrite:
        - !GetAtt GitHubStateTable.Arn
    - LambdaInvoke:
        - !GetAtt GithubFunction.Arn
    - CloudWatchLogs
```

**Hatebu Feed Subscriber Lambda用ロール**:
```yaml
HatebuFeedSubscriberRole:
  Policies:
    - DynamoDBReadWrite:
        - !GetAtt HatebuStateTable.Arn
    - LambdaInvoke:
        - !GetAtt HatebuFunction.Arn
    - CloudWatchLogs
```

**EventBridge Scheduler用ロール**:
```yaml
GitHubSchedulerRole:
  Policies:
    - LambdaInvoke:
        - !GetAtt GitHubFeedSubscriberFunction.Arn

HatebuSchedulerRole:
  Policies:
    - LambdaInvoke:
        - !GetAtt HatebuFeedSubscriberFunction.Arn
```

#### シークレット管理

- Feed URLのトークンはLambdaの環境変数に直接保存
- CloudFormationパラメータで受け取り、環境変数に設定

```yaml
GitHubFeedSubscriberFunction:
  Environment:
    Variables:
      FEED_URL: !Ref GitHubFeedUrl  # CloudFormationパラメータから取得
      STATE_TABLE_NAME: !Ref GitHubStateTable
      TARGET_FUNCTION_ARN: !GetAtt GithubFunction.Arn

HatebuFeedSubscriberFunction:
  Environment:
    Variables:
      FEED_URL: !Ref HatebuFeedUrl  # CloudFormationパラメータから取得
      STATE_TABLE_NAME: !Ref HatebuStateTable
      TARGET_FUNCTION_ARN: !GetAtt HatebuFunction.Arn

# CloudFormation Parametersセクションに追加
Parameters:
  GitHubFeedUrl:
    Type: String
    Description: "GitHub feed URL with token"
    NoEcho: true  # CloudFormation UIでマスク表示
  HatebuFeedUrl:
    Type: String
    Description: "Hatebu feed URL with key"
    NoEcho: true  # CloudFormation UIでマスク表示
```

### エラーハンドリングとモニタリング

#### リトライ戦略

1. **フィード取得エラー**: 3回リトライ（指数バックオフ）
2. **DynamoDB操作エラー**: SDK標準リトライ
3. **Lambda呼び出しエラー**: 2回リトライ

#### CloudWatch Alarms

```yaml
GitHubFeedSubscriberErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: github-feed-subscriber-errors
    MetricName: Errors
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref GitHubFeedSubscriberFunction
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 1

HatebuFeedSubscriberErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: hatebu-feed-subscriber-errors
    MetricName: Errors
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref HatebuFeedSubscriberFunction
    Statistic: Sum
    Period: 900  # 15分（実行間隔に合わせる）
    EvaluationPeriods: 1
    Threshold: 1

GitHubFeedSubscriberDurationAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: github-feed-subscriber-duration
    MetricName: Duration
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref GitHubFeedSubscriberFunction
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10000  # 10秒

HatebuFeedSubscriberDurationAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: hatebu-feed-subscriber-duration
    MetricName: Duration
    Namespace: AWS/Lambda
    Dimensions:
      - Name: FunctionName
        Value: !Ref HatebuFeedSubscriberFunction
    Statistic: Average
    Period: 900
    EvaluationPeriods: 2
    Threshold: 20000  # 20秒（HTMLパース処理のため長め）
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
   - [ ] `github/subscriber/` ディレクトリ作成
   - [ ] `hatebu/subscriber/` ディレクトリ作成
   - [ ] TypeScript環境セットアップ
   - [ ] 必要な依存関係インストール

2. **Day 3-4**: DynamoDB構築
   - [ ] GitHub用テーブル定義をtemplate.yamlに追加
   - [ ] Hatebu用テーブル定義をtemplate.yamlに追加
   - [ ] 両テーブルのTTL設定
   - [ ] 手動テスト用スクリプト作成

3. **Day 5**: Feed Subscriber基本実装
   - [ ] GitHub Feed Subscriber実装（Atom形式対応）
   - [ ] Hatebu Feed Subscriber実装（RSS 1.0/RDF形式対応）
   - [ ] 各Lambda関数のユニットテスト作成

### Phase 2: 統合実装（2週目）

4. **Day 6-7**: Lambda間連携
   - [ ] 既存Lambda関数の修正
   - [ ] 直接呼び出しインターフェース実装
   - [ ] API Gateway設定の削除（後方互換性不要）

5. **Day 8-9**: EventBridge設定
   - [ ] GitHub用Scheduler定義追加
   - [ ] Hatebu用Scheduler定義追加
   - [ ] 各Lambda用IAMロール設定
   - [ ] 各Scheduler用IAMロール設定
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

### Phase 5: リファクタリング（オプション）

12. **Day 19-20**: 共通化の検討
    - [ ] DynamoDB操作の共通化検討
    - [ ] エラーハンドリングの共通化検討
    - [ ] 共通ライブラリ作成（必要な場合）
    - [ ] ユニットテストの追加

## コスト試算

### 月間コスト概算

| リソース | 使用量 | 単価 | 月額 |
|---------|--------|------|------|
| Lambda実行 (GitHub) | 8,640回 × 0.5秒 | $0.0000166667/GB秒 | $0.07 |
| Lambda実行 (Hatebu) | 2,880回 × 1秒 | $0.0000166667/GB秒 | $0.05 |
| Lambda呼び出し (合計) | 11,520回 | $0.20/100万回 | $0.002 |
| DynamoDB書き込み | 1,000回 | $1.25/100万回 | $0.001 |
| DynamoDB読み取り | 11,520回 | $0.25/100万回 | $0.003 |
| DynamoDBストレージ | 2GB (2テーブル) | $0.25/GB | $0.50 |
| EventBridge Scheduler | 11,520回 | $1.00/100万回 | $0.012 |
| **合計** | | | **約$0.64** |

## リスクと対策

### 技術的リスク

1. **フィード形式変更**
   - 対策: パーサーの柔軟な実装、エラー通知

2. **大量エントリーによる処理遅延**
   - 対策: 並列処理、タイムアウト設定

3. **DynamoDB整合性問題**
   - 対策: 条件付き書き込み、重複チェック強化

4. **テーブル分割による管理コスト**
   - 対策: Infrastructure as Codeで自動化、モニタリングダッシュボードの活用

### 運用リスク

1. **IFTTT停止時の取りこぼし**
   - 対策: 並行稼働期間の設定、初回実行時の過去分取得

2. **コスト超過**
   - 対策: Budget Alerts設定、実行頻度の動的調整

## 成功基準

- [ ] 全てのフィードエントリーが確実に処理される
- [ ] 重複投稿が発生しない
- [ ] エラー率が0.1%未満
- [ ] GitHub Feed Subscriberの平均処理時間が5秒以内
- [ ] Hatebu Feed Subscriberの平均処理時間が10秒以内
- [ ] 月間コストが$1以内

## 次のステップ

1. この計画のレビューと承認
2. 開発環境の準備
3. Phase 1の実装開始

## 関数分割の利点

1. **独立性**: 片方のフィードに問題があっても、もう片方は正常に動作
2. **最適化**: 各関数の実行間隔、メモリサイズ、タイムアウトを個別に調整可能
3. **モニタリング**: エラー通知やメトリクスを個別に追跡
4. **メンテナンス**: 各フィード固有のロジックを追加しやすい
