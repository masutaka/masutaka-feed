import { createRestAPIClient } from 'masto';
import { Context, SQSEvent } from 'aws-lambda';

// hatebu/subscriber/index.ts の QueueMessage と合わせること
interface QueueMessage {
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

// BatchSize は 1 なので、Records は 1 件だけ届く
export const handler = async (
  event: SQSEvent,
  _context: Context
): Promise<void> => {
  for (const record of event.Records) {
    const message: QueueMessage = JSON.parse(record.body);
    console.info('Starting Hatebu notifier with message:', message);

    const { entryAuthor, entryComment, entryTitle, entryUrl } = message;
    await processEntry(entryAuthor, entryComment, entryTitle, entryUrl);
  }
};


const processEntry = async (
  author: string,
  comment: string,
  title: string,
  url: string,
): Promise<void> => {
  console.info(`Processing entry for Hatebu: ${url}`);

  try {
    const response = await postToMastodon(
      `[B!] id:${author} ${comment} > ${title} ${url}`.replace(/ +/g, ' ')
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
      status,
    });
  } catch (error) {
    console.error('Failed to post to Mastodon:', error);
    throw error;
  }
};
