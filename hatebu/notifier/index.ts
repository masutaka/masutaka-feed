import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';

// hatebu/subscriber/index.ts の DirectInvokeEvent と合わせること
interface DirectInvokeEvent {
  entryAuthor: string;
  entryComment: string;
  entryTitle: string;
  entryUrl: string;
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

  const { entryAuthor, entryComment, entryTitle, entryUrl } = event;
  return await processEntry(entryAuthor, entryComment, entryTitle, entryUrl);
};


const processEntry = async (
  entryAuthor: string,
  entryComment: string,
  entryTitle: string,
  entryUrl: string,
): Promise<void> => {
  console.log(`entryAuthor: ${entryAuthor}`);
  console.log(`entryComment: ${entryComment}`);
  console.log(`entryTitle: ${entryTitle}`);
  console.log(`entryUrl: ${entryUrl}`);

  try {
    const response = await postToMastodon(
      `[B!] id:${entryAuthor} ${entryComment} > ${entryTitle} ${entryUrl}`.replace(/ +/g, ' ')
    );
    
    console.info('response ->', JSON.stringify(response));
  } catch (error) {
    console.error('Error occurred:', error);
    throw error;
  }
};

const postToMastodon = async (status: string): Promise<any> => {
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
