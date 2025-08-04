import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';
import { Pushover } from './pushover';

// github/subscriber/index.ts の DirectInvokeEvent と合わせること
interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}

const ITEM_TITLE_IGNORE_REGEXP = new RegExp(process.env.ITEM_TITLE_IGNORE_REGEXP!);
const ITEM_URL_IGNORE_REGEXP = new RegExp(process.env.ITEM_URL_IGNORE_REGEXP!);
const ITEM_TITLE_PUSHOVER_REGEXP = new RegExp(process.env.ITEM_TITLE_PUSHOVER_REGEXP!);
const MASTODON_URL = process.env.MASTODON_URL!;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN!;
const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY!;
const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN!;

const mastodonClient = createRestAPIClient({
  url: MASTODON_URL,
  accessToken: MASTODON_ACCESS_TOKEN,
});

const pushoverClient = new Pushover({
  user: PUSHOVER_USER_KEY,
  token: PUSHOVER_APP_TOKEN,
});

export const handler = async (
  event: DirectInvokeEvent,
  _context: Context
): Promise<void> => {
  console.info('Starting GitHub notifier with event:', event);

  const { entryTitle, entryUrl } = event;
  return await processEntry(entryTitle, entryUrl);
};

const processEntry = async (title: string, url: string): Promise<void> => {
  console.info(`Processing entry for GitHub: ${url}`);

  if (ITEM_TITLE_IGNORE_REGEXP.test(title)) {
    console.info(`Ignoring entry "${title}" (matched ${ITEM_TITLE_IGNORE_REGEXP})`);
    return;
  }

  if (ITEM_URL_IGNORE_REGEXP.test(url)) {
    console.info(`Ignoring entry "${url}" (matched ${ITEM_URL_IGNORE_REGEXP})`);
    return;
  }

  const message = buildMessage(title, url);

  try {
    const [mastodonResponse, pushoverResponse] = await Promise.all([
      postToMastodon(`[GH] ${title} ${message}`),
      sendPushover(title, message)
    ]);

    console.info('Successfully posted to Mastodon:', mastodonResponse);
    console.info('Successfully sent to Pushover:', pushoverResponse);
  } catch (error) {
    console.error('Failed to process entry:', error);
    throw error;
  }
};

const postToMastodon = async (status: string): Promise<any> => {
  try {
    return await mastodonClient.v1.statuses.create({
      status,
    });
  } catch (error) {
    console.error('Failed to post to Mastodon:', error);
    throw error;
  }
};

const sendPushover = async (title: string, message: string): Promise<any> => {
  if (!ITEM_TITLE_PUSHOVER_REGEXP.test(title)) {
    console.info(`Skipping Pushover notification for "${title}" (no match with ${ITEM_TITLE_PUSHOVER_REGEXP})`);
    return Promise.resolve('Skipped Pushover notification');
  }

  try {
    return await pushoverClient.send({
      title,
      message, // required
      device: 'Android',
      priority: 0,      // normal
      sound: 'gamelan',
    });
  } catch (error) {
    console.error('Failed to send to Pushover:', error);
    throw error;
  }
};

const buildMessage = (title: string, url: string): string => {
  const found = title.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return url;
};
