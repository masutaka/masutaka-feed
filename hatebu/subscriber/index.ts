import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { createHash } from 'node:crypto';
import Parser from 'rss-parser'; // eslint-disable-line @typescript-eslint/naming-convention

interface HatebuFeedItem {
  // favorite.rss 定義

  'rdf:about': string;             // <item rdf:about="...">
  title: string;                   //   <title>...</title>
  link: string;                    //   <link>...</link>
  description: string;             //   <description>...</description>
  'dc:creator': string;            //   <dc:creator>...</dc:creator>
  'dc:date': string;               //   <dc:date>...</dc:date>
  'hatena:bookmarkcount': string;  //   <hatena:bookmarkcount>...</hatena:bookmarkcount>
  'content:encoded': string;       //   <content:encoded>...</content:encoded>
                                   // </item>

  // rss-parser は RSS 1.0 形式の場合、<description> タグの内容を以下のフィールドに自動的に格納する:
  // - content: description の内容（HTML エンティティがデコードされる）
  // - contentSnippet: content から HTML タグを除去したプレーンテキスト
  // はてなブックマークの RSS フィードでは、ユーザーのコメントは description タグに含まれているため、
  // contentSnippet フィールドにコメントのプレーンテキストが格納される。
  contentSnippet: string;
}

// hatebu/notifier/index.ts の QueueMessage と合わせること
interface QueueMessage {
  entryAuthor: string;
  entryComment: string;
  entryTitle: string;
  entryUrl: string;
}

const FEED_URL = process.env.FEED_URL!;
const STATE_TABLE_NAME = process.env.STATE_TABLE_NAME!;
const QUEUE_URL = process.env.QUEUE_URL!;

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sqsClient = new SQSClient({});

// FIFO キューはメッセージグループごとに順序を保証するため、グループを 1 つに固定して全体の順序を保つ
const MESSAGE_GROUP_ID = 'hatebu';

export const handler = async (): Promise<void> => {
  console.info('Starting Hatebu feed subscription');

  try {
    const parser = new Parser<object, HatebuFeedItem>();
    const feed = await parser.parseURL(FEED_URL);

    console.info(`Processing ${feed.items.length} feed items`);

    // フィードは新しい順に並んでいるため、古い順に投稿されるよう逆順に処理する
    for (const item of [...feed.items].reverse()) {
      const entryId = item['rdf:about']?.trim();
      if (!entryId) {
        console.warn('Skipping item without ID or with empty ID:', item);
        continue;
      }

      const isNew = await checkIfNewEntry(entryId, STATE_TABLE_NAME);

      if (isNew) {
        await processNewEntry(entryId, item, QUEUE_URL, STATE_TABLE_NAME);
      } else {
        console.info(`Skipping already processed entry: ${entryId}`);
      }
    }

    console.info('Feed subscription completed successfully');
  } catch (error) {
    console.error('Error processing feed:', error);
    throw error;
  }
};

const checkIfNewEntry = async (entryId: string, tableName: string): Promise<boolean> => {
  try {
    const result = await dynamoClient.send(new GetCommand({
      TableName: tableName,
      Key: { entry_id: entryId }
    }));
    return !result.Item;
  } catch (error) {
    console.error(`Error checking entry ${entryId}:`, error);
    throw error;
  }
};

const processNewEntry = async (
  entryId: string,
  item: HatebuFeedItem,
  queueUrl: string,
  tableName: string
): Promise<void> => {
  console.info(`Processing new entry: ${entryId}`);

  const message: QueueMessage = {
    entryAuthor: item['dc:creator'],
    entryComment: item.contentSnippet,
    entryTitle: item.title,
    entryUrl: item.link,
  };

  try {
    await sqsClient.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageGroupId: MESSAGE_GROUP_ID,
      // MessageDeduplicationId は 128 文字までで、使える文字も限られるため、entry ID のハッシュ値を使う
      MessageDeduplicationId: createHash('sha256').update(entryId).digest('hex'),
    }));

    await markAsProcessed(entryId, item, tableName);
    console.info(`Successfully processed entry: ${entryId}`);
  } catch (error) {
    console.error(`Failed to process entry ${entryId}:`, error);
    throw error;
  }
};

const markAsProcessed = async (entryId: string, item: HatebuFeedItem, tableName: string): Promise<void> => {
  const now = Math.floor(Date.now() / 1000);
  try {
    await dynamoClient.send(new PutCommand({
      TableName: tableName,
      Item: {
        entry_id: entryId,
        processed_at: now,
        entry_data: item,
        ttl: now + (30 * 24 * 60 * 60)  // 30日後に削除
      }
    }));
  } catch (error) {
    console.error(`Error marking entry ${entryId} as processed:`, error);
    throw error;
  }
};
