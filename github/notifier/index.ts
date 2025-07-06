import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';
import { format } from 'util';
import { Pushover } from './pushover';

// Lambda直接呼び出し用の型定義
interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}

// 環境変数の型定義
interface EnvironmentVariables {
  MASTODON_URL: string;
  MASTODON_ACCESS_TOKEN: string;
  GITHUB_TITLE_IGNORE_REGEXP: string;
  GITHUB_TITLE_PUSHOVER_REGEXP: string;
  PUSHOVER_USER_KEY: string;
  PUSHOVER_APP_TOKEN: string;
}

// 型安全な環境変数取得
const getEnvVar = (key: keyof EnvironmentVariables): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

const GITHUB_TITLE_IGNORE_REGEXP = new RegExp(getEnvVar('GITHUB_TITLE_IGNORE_REGEXP'));
const GITHUB_TITLE_PUSHOVER_REGEXP = new RegExp(getEnvVar('GITHUB_TITLE_PUSHOVER_REGEXP'));
const MASTODON_URL = getEnvVar('MASTODON_URL');
const MASTODON_ACCESS_TOKEN = getEnvVar('MASTODON_ACCESS_TOKEN');
const PUSHOVER_USER_KEY = getEnvVar('PUSHOVER_USER_KEY');
const PUSHOVER_APP_TOKEN = getEnvVar('PUSHOVER_APP_TOKEN');

const PushoverClient = new Pushover({
  user: PUSHOVER_USER_KEY,
  token: PUSHOVER_APP_TOKEN,
});

export const handler = async (
  event: DirectInvokeEvent,
  context: Context
): Promise<void> => {
  console.log('event ->', JSON.stringify(event));
  console.log('context ->', JSON.stringify(context));

  const { entryTitle, entryUrl } = event;
  return await processEntry(entryTitle, entryUrl);
};

const processEntry = async (entryTitle: string, entryUrl: string): Promise<void> => {
  console.log(`entryTitle: ${entryTitle}`);
  console.log(`entryUrl: ${entryUrl}`);

  if (GITHUB_TITLE_IGNORE_REGEXP.test(entryTitle)) {
    console.info(`[GH] Ignore "${entryTitle}"`);
    return;
  }

  try {
    const [mastodonResponse, pushoverResponse] = await Promise.all([
      postToMastodon(`[GH] ${entryTitle} ${getMessage(entryTitle, entryUrl)}`), 
      sendPushover(entryTitle, entryUrl)
    ]);
    
    console.info('[Mastodon] response ->', JSON.stringify(mastodonResponse));
    console.info('[Pushover] response ->', JSON.stringify(pushoverResponse));
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

const sendPushover = async (entryTitle: string, entryUrl: string): Promise<any> => {
  const message = getMessage(entryTitle, entryUrl);

  if (GITHUB_TITLE_PUSHOVER_REGEXP.test(entryTitle)) {
    return PushoverClient.send({
      title: entryTitle,
      message: message, // required
      device: 'Android',
      priority: 0,      // normal
      sound: 'gamelan',
    });
  }

  const skipMessage = format(
    'Doesn\'t send to pushover because the entryTitle "%s" doesnot match with %s',
    entryTitle,
    GITHUB_TITLE_PUSHOVER_REGEXP
  );
  return Promise.resolve(skipMessage);
};

const getMessage = (entryTitle: string, entryUrl: string): string => {
  const found = entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return entryUrl;
};
