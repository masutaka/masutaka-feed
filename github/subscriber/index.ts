import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import Parser from 'rss-parser';

interface GitHubFeedItem {
  // masutaka.private.atom 定義

                    // <entry>
  id: string;       //   <id>...</id>
  pubDate: string;  //   <published>...</published>
  link: string;     //   <link type="text/html" rel="alternate" href="..."/>
  title: string;    //   <title type="html">...</title>
  author: string;   //   <author><name>...</name></author>
  content: string;  //   <content type="html">...</content>
                    // </entry>

  // rss-parser が content から HTML タグを除去した純粋なテキストに変換する
  contentSnippet: string;
}

// github/notifier/index.ts の DirectInvokeEvent と合わせること
interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}

const FEED_URL = process.env.FEED_URL!;
const STATE_TABLE_NAME = process.env.STATE_TABLE_NAME!;
const TARGET_FUNCTION_ARN = process.env.TARGET_FUNCTION_ARN!;

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambdaClient = new LambdaClient({});

export const handler = async (): Promise<void> => {
  console.info('Starting GitHub feed subscription');

  try {
    const parser = new Parser<object, GitHubFeedItem>();
    const feed = await parser.parseURL(FEED_URL);

    console.info(`Processing ${feed.items.length} feed items`);

    for (const item of feed.items) {
      const entryId = item.id?.trim();
      if (!entryId) {
        console.warn('Skipping item without ID or with empty ID:', item);
        continue;
      }

      const isNew = await checkIfNewEntry(entryId, STATE_TABLE_NAME);

      if (isNew) {
        await processNewEntry(entryId, item, TARGET_FUNCTION_ARN, STATE_TABLE_NAME);
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
  item: GitHubFeedItem,
  targetFunctionArn: string,
  tableName: string
): Promise<void> => {
  console.info(`Processing new entry: ${entryId}`);

  const payload: DirectInvokeEvent = {
    entryTitle: item.title,
    entryUrl: item.link
  };

  try {
    await lambdaClient.send(new InvokeCommand({
      FunctionName: targetFunctionArn,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify(payload))
    }));

    await markAsProcessed(entryId, item, tableName);
    console.info(`Successfully processed entry: ${entryId}`);
  } catch (error) {
    console.error(`Failed to process entry ${entryId}:`, error);
    throw error;
  }
};

const markAsProcessed = async (entryId: string, item: GitHubFeedItem, tableName: string): Promise<void> => {
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
