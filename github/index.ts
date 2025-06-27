import { createRestAPIClient } from 'masto';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

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
  MY_ACCESS_TOKEN: string;
  MASTODON_URL: string;
  MASTODON_ACCESS_TOKEN: string;
  GITHUB_TITLE_IGNORE_REGEXP?: string;
  GITHUB_TITLE_PUSHOVER_REGEXP?: string;
  PUSHOVER_USER_KEY?: string;
  PUSHOVER_APP_TOKEN?: string;
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

const MY_ACCESS_TOKEN = getEnvVar('MY_ACCESS_TOKEN');
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
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('event ->', JSON.stringify(event).replace(MY_ACCESS_TOKEN || '', '********'));
  console.log('context ->', JSON.stringify(context));

  // eventBody is string which is the following format.
  //
  // accessToken: {{AccessToken}}  # <= It should be first
  // entryTitle: {{EntryTitle}}
  // entryUrl: {{EntryUrl}}
  const eventBody = event.body;
  
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

  const entryTitle = getEntryTitle(eventBody);
  console.log(`entryTitle: ${entryTitle}`);

  if (GITHUB_TITLE_IGNORE_REGEXP.test(entryTitle)) {
    console.info(`[GH] Ignore "${entryTitle}"`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Ignored by filter' })
    };
  }

  const entryUrl = getEntryUrl(eventBody);
  console.log(`entryUrl: ${entryUrl}`);

  try {
    const [mastodon, pushover] = await Promise.all([
      postToMastodon(entryTitle, entryUrl), 
      sendPushover(entryTitle, entryUrl)
    ]);
    
    console.info('[Mastodon] response ->', JSON.stringify(mastodon));
    console.info('[Pushover] response ->', JSON.stringify(pushover));
    
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Just posted or pushovered!' })
    };
  } catch (error) {
    console.error('Error occurred:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to post or pushover...' })
    };
  }
};

const getAccessToken = (eventBody: string): string => {
  const match = eventBody.match(/^accessToken: (.+)/);
  if (!match) {
    throw new Error('Access token not found in event body');
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


const postToMastodon = async (entryTitle: string, entryUrl: string): Promise<any> => {
  try {
    const masto = await createRestAPIClient({
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

const sendPushover = (entryTitle: string, entryUrl: string): Promise<any> | string => {
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

  return `Doesn't send to pushover because the entryTitle "${entryTitle}" doesnot match with ${GITHUB_TITLE_PUSHOVER_REGEXP}`;
};

const getMessage = (entryTitle: string, entryUrl: string): string => {
  const found = entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return entryUrl;
};
