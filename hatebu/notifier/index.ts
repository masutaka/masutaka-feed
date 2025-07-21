import { createRestAPIClient } from 'masto';
import { Context } from 'aws-lambda';

// hatebu/subscriber/index.ts の DirectInvokeEvent と合わせること
interface DirectInvokeEvent {
  entryAuthor: string;
  entryComment: string;
  entryTitle: string;
  entryUrl: string;
}

const MASTODON_URL = process.env.MASTODON_URL!;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN!;

const mastodonClient = createRestAPIClient({
  url: MASTODON_URL,
  accessToken: MASTODON_ACCESS_TOKEN,
});

export const handler = async (
  event: DirectInvokeEvent,
  _context: Context
): Promise<void> => {
  console.info('Starting Hatebu notifier with event:', event);

  const { entryAuthor, entryComment, entryTitle, entryUrl } = event;
  return await processEntry(entryAuthor, entryComment, entryTitle, entryUrl);
};


const processEntry = async (
  entryAuthor: string,
  entryComment: string,
  entryTitle: string,
  entryUrl: string,
): Promise<void> => {
  console.info(`Processing entry for Hatebu: ${entryUrl}`);

  try {
    const response = await postToMastodon(
      `[B!] id:${entryAuthor} ${entryComment} > ${entryTitle} ${entryUrl}`.replace(/ +/g, ' ')
    );

    console.info('Successfully posted to Mastodon:', response);
  } catch (error) {
    console.error('Failed to process entry:', error);
    throw error;
  }
};

const postToMastodon = async (status: string): Promise<any> => {
  try {
    return await mastodonClient.v1.statuses.create({
      status: status,
    });
  } catch (error) {
    console.error('Failed to post to Mastodon:', error);
    throw error;
  }
};
