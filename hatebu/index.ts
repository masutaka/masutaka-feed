import { createRestAPIClient } from 'masto';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

console.info('Loading function');

// 環境変数の型定義
interface EnvironmentVariables {
  MY_ACCESS_TOKEN: string;
  MASTODON_URL: string;
  MASTODON_ACCESS_TOKEN: string;
}

// Lambda直接呼び出し用の型定義
interface DirectInvokeEvent {
  entryAuthor: string;
  entryTitle: string;
  entryUrl: string;
  entryContent: string;
}

// 型安全な環境変数取得
const getEnvVar = (key: keyof EnvironmentVariables): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

const MY_ACCESS_TOKEN = getEnvVar('MY_ACCESS_TOKEN');
const MASTODON_URL = getEnvVar('MASTODON_URL');
const MASTODON_ACCESS_TOKEN = getEnvVar('MASTODON_ACCESS_TOKEN');

export const handler = async (
  event: APIGatewayProxyEvent | DirectInvokeEvent,
  context: Context
): Promise<APIGatewayProxyResult | void> => {
  console.log('event ->', JSON.stringify(event).replace(MY_ACCESS_TOKEN, '********'));
  console.log('context ->', JSON.stringify(context));

  // 呼び出し元の判定
  const isDirect = !('httpMethod' in event);

  if (isDirect) {
    // Lambda直接呼び出しの場合
    const { entryAuthor, entryTitle, entryUrl, entryContent } = event as DirectInvokeEvent;
    return await processEntry(entryAuthor, entryTitle, entryUrl, entryContent);
  } else {
    // API Gateway経由の場合（後方互換性）
    const apiEvent = event as APIGatewayProxyEvent;
    const eventBody = apiEvent.body;
    
    if (!eventBody) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Event body is missing' })
      };
    }

    const accessToken = getAccessToken(eventBody);
    if (accessToken != MY_ACCESS_TOKEN) {
      console.error(`Invalid token ${accessToken}`);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    const entryAuthor = getEntryAuthor(eventBody);
    const entryTitle = getEntryTitle(eventBody);
    const entryUrl = getEntryUrl(eventBody);
    const hatebuComment = getHatebuComment(eventBody);

    try {
      await processEntry(entryAuthor, entryTitle, entryUrl, hatebuComment);
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Just posted!' })
      };
    } catch (error) {
      console.error('error ->', JSON.stringify(error));
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to post...' })
      };
    }
  }
};

const getAccessToken = (eventBody: string): string => {
  const match = eventBody.match(/^accessToken: (.+)/);
  if (!match) {
    throw new Error('Access token not found in event body');
  }
  return match[1];
};

const getEntryAuthor = (eventBody: string): string => {
  const match = eventBody.match(/\nentryAuthor: (.+)/);
  if (!match) {
    throw new Error('Entry author not found in event body');
  }
  return match[1];
};

const getEntryTitle = (eventBody: string): string => {
  const match = eventBody.match(/\nentryTitle: (.+)/);
  if (!match) {
    throw new Error('Entry title not found in event body');
  }
  return match[1];
};

const getEntryUrl = (eventBody: string): string => {
  const match = eventBody.match(/\nentryUrl: (.+)/);
  if (!match) {
    throw new Error('Entry URL not found in event body');
  }
  return match[1];
};

const getEntryContent = (eventBody: string): string => {
  // entryContent may contain line breaks.
  const match = eventBody.match(/\nentryContent: (.+)/s);
  if (!match) {
    throw new Error('Entry content not found in event body');
  }
  return match[1].replace(/\n/g, '');
};

const getHatebuComment = (eventBody: string): string => {
  const entryContent = getEntryContent(eventBody);
  return getHatebuCommentFromContent(entryContent);
};

const getHatebuCommentFromContent = (entryContent: string): string => {
  console.log(`entryContent: ${entryContent}`);

  if (/<\/a> <\/p>$/.test(entryContent)) {
    return '';
  }

  const commentMatch = entryContent.match(/<\/a> ([^>]+)<\/p>$/);
  if (!commentMatch) {
    throw new Error('Hatebu comment not found in entry content');
  }
  
  return commentMatch[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
};

const processEntry = async (entryAuthor: string, entryTitle: string, entryUrl: string, entryContent: string): Promise<void> => {
  console.log(`entryAuthor: ${entryAuthor}`);
  console.log(`entryTitle: ${entryTitle}`);
  console.log(`entryUrl: ${entryUrl}`);
  
  const hatebuComment = getHatebuCommentFromContent(entryContent);
  console.log(`hatebuComment: ${hatebuComment}`);

  try {
    const response = await postToMastodon({
      status: `[B!] id:${entryAuthor} ${hatebuComment} > ${entryTitle} ${entryUrl}`.replace(/ +/g, ' '),
    });
    
    console.info('response ->', JSON.stringify(response));
  } catch (error) {
    console.error('error ->', JSON.stringify(error));
    throw error;
  }
};

interface PostToMastodonParams {
  status: string;
}

const postToMastodon = async (params: PostToMastodonParams): Promise<any> => {
  const { status } = params;

  try {
    const masto = createRestAPIClient({
      url: MASTODON_URL,
      accessToken: MASTODON_ACCESS_TOKEN,
    });

    return await masto.v1.statuses.create({
      status: status,
    });
  } catch (error) {
    console.error('Failed to post to Mastodon:', error);
    throw error;
  }
};
