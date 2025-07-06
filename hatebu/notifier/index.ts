import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';

// Lambda直接呼び出し用の型定義
interface DirectInvokeEvent {
  entryAuthor: string;
  entryTitle: string;
  entryUrl: string;
  entryContent: string;
}

// 環境変数の型定義
interface EnvironmentVariables {
  MASTODON_URL: string;
  MASTODON_ACCESS_TOKEN: string;
}

// 型安全な環境変数取得
const getEnvVar = (key: keyof EnvironmentVariables): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

const MASTODON_URL = getEnvVar('MASTODON_URL');
const MASTODON_ACCESS_TOKEN = getEnvVar('MASTODON_ACCESS_TOKEN');

export const handler = async (
  event: DirectInvokeEvent,
  context: Context
): Promise<void> => {
  console.log('event ->', JSON.stringify(event));
  console.log('context ->', JSON.stringify(context));

  const { entryAuthor, entryTitle, entryUrl, entryContent } = event;
  return await processEntry(entryAuthor, entryTitle, entryUrl, entryContent);
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

const processEntry = async (
  entryAuthor: string,
  entryTitle: string,
  entryUrl: string,
  entryContent: string
): Promise<void> => {
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
