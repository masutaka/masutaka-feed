import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import Parser from 'rss-parser';

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambdaClient = new LambdaClient({});

interface HatebuFeedItem {
  'rdf:about': string;
  title: string;
  link: string;
  description?: string;
  'dc:creator': string;
  'dc:date': string;
  'content:encoded': string;
  'hatena:bookmarkcount'?: string;
}

interface DirectInvokeEvent {
  entryAuthor: string;
  entryTitle: string;
  entryUrl: string;
  entryContent: string;
}

export const handler = async (): Promise<void> => {
  console.info('Starting Hatebu feed subscription');

  const feedUrl = process.env.FEED_URL;
  const tableName = process.env.STATE_TABLE_NAME;
  const targetFunctionArn = process.env.TARGET_FUNCTION_ARN;

  if (!feedUrl || !tableName || !targetFunctionArn) {
    throw new Error('Required environment variables are not set');
  }

  try {
    const parser = new Parser<object, HatebuFeedItem>();
    const feed = await parser.parseURL(feedUrl);

    console.info(`Processing ${feed.items.length} feed items`);

    for (const item of feed.items) {
      const entryId = item['rdf:about']?.trim();
      if (!entryId) {
        console.warn('Skipping item without ID or with empty ID:', item);
        continue;
      }

      const isNew = await checkIfNewEntry(entryId, tableName);

      if (isNew) {
        await processNewEntry(entryId, item, targetFunctionArn, tableName);
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
  targetFunctionArn: string,
  tableName: string
): Promise<void> => {
  console.info(`Processing new entry: ${entryId}`);

  const payload: DirectInvokeEvent = {
    entryAuthor: item['dc:creator'],
    entryTitle: item.title,
    entryUrl: item.link,
    entryContent: item['content:encoded']
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
