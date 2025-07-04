import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';
import { format } from 'util';

// pushover-notificationsをrequireで読み込み
const PushoverLib = require('pushover-notifications') as typeof Pushover;

console.info('Loading function');

// Pushover型定義
interface PushoverConfig {
  user?: string;
  token?: string;
}

interface PushoverMessage {
  title: string;
  message: string;
  device?: string;
  priority?: number;
  sound?: string;
}

// pushover-notificationsの型定義
declare class Pushover {
  constructor(config: PushoverConfig);
  send(message: PushoverMessage): Promise<any>;
}

// 環境変数の型定義
interface EnvironmentVariables {
  MASTODON_URL: string;
  MASTODON_ACCESS_TOKEN: string;
  GITHUB_TITLE_IGNORE_REGEXP?: string;
  GITHUB_TITLE_PUSHOVER_REGEXP?: string;
  PUSHOVER_USER_KEY?: string;
  PUSHOVER_APP_TOKEN?: string;
}

// Lambda直接呼び出し用の型定義
interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}

// 型安全な環境変数取得
const getEnvVar = (key: keyof EnvironmentVariables): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
};

const getOptionalEnvVar = (key: keyof EnvironmentVariables): string | undefined => {
  return process.env[key];
};

const MASTODON_URL = getEnvVar('MASTODON_URL');
const MASTODON_ACCESS_TOKEN = getEnvVar('MASTODON_ACCESS_TOKEN');
const PUSHOVER_USER_KEY = getOptionalEnvVar('PUSHOVER_USER_KEY');
const PUSHOVER_APP_TOKEN = getOptionalEnvVar('PUSHOVER_APP_TOKEN');

const PushoverClient = new PushoverLib({
  user: PUSHOVER_USER_KEY,
  token: PUSHOVER_APP_TOKEN,
});

const GITHUB_TITLE_IGNORE_REGEXP = new RegExp(getOptionalEnvVar('GITHUB_TITLE_IGNORE_REGEXP') || '');
const GITHUB_TITLE_PUSHOVER_REGEXP = new RegExp(getOptionalEnvVar('GITHUB_TITLE_PUSHOVER_REGEXP') || '');

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
    const [mastodon, pushover] = await Promise.all([
      postToMastodon(entryTitle, entryUrl), 
      sendPushover(entryTitle, entryUrl)
    ]);
    
    console.info('[Mastodon] response ->', JSON.stringify(mastodon));
    console.info('[Pushover] response ->', JSON.stringify(pushover));
  } catch (error) {
    console.error('Error occurred:', error);
    throw error;
  }
};

const postToMastodon = async (entryTitle: string, entryUrl: string): Promise<any> => {
  try {
    const masto = createRestAPIClient({
      url: MASTODON_URL,
      accessToken: MASTODON_ACCESS_TOKEN,
    });

    return await masto.v1.statuses.create({
      status: `[GH] ${entryTitle} ${getMessage(entryTitle, entryUrl)}`,
    });
  } catch (error) {
    console.error('[Mastodon] Failed to post', error);
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
