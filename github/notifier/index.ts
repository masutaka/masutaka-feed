import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';
import { Pushover } from './pushover';

// github/subscriber/index.ts の DirectInvokeEvent と合わせること
interface DirectInvokeEvent {
  entryTitle: string;
  entryUrl: string;
}

const ITEM_TITLE_IGNORE_REGEXP = new RegExp(process.env.ITEM_TITLE_IGNORE_REGEXP!);
const ITEM_TITLE_PUSHOVER_REGEXP = new RegExp(process.env.ITEM_TITLE_PUSHOVER_REGEXP!);
const MASTODON_URL = process.env.MASTODON_URL!;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN!;
const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY!;
const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN!;

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

const processEntry = async (entryTitle: string, entryUrl: string): Promise<void> => {
  console.info(`Processing entry for GitHub: ${entryUrl}`);

  if (ITEM_TITLE_IGNORE_REGEXP.test(entryTitle)) {
    console.info(`Ignoring entry "${entryTitle}" (matched ${ITEM_TITLE_IGNORE_REGEXP})`);
    return;
  }

  const message = buildMessage(entryTitle, entryUrl);

  try {
    const [mastodonResponse, pushoverResponse] = await Promise.all([
      postToMastodon(`[GH] ${entryTitle} ${message}`),
      sendPushover(entryTitle, message)
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

const sendPushover = async (entryTitle: string, message: string): Promise<any> => {
  if (!ITEM_TITLE_PUSHOVER_REGEXP.test(entryTitle)) {
    console.info(`Skipping Pushover notification for "${entryTitle}" (no match with ${ITEM_TITLE_PUSHOVER_REGEXP})`);
    return Promise.resolve('Skipped Pushover notification');
  }

  try {
    return await pushoverClient.send({
      title: entryTitle,
      message: message, // required
      device: 'Android',
      priority: 0,      // normal
      sound: 'gamelan',
    });
  } catch (error) {
    console.error('Failed to send to Pushover:', error);
    throw error;
  }
};

const buildMessage = (entryTitle: string, entryUrl: string): string => {
  const found = entryTitle.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return entryUrl;
};
