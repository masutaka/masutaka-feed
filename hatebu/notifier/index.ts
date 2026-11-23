import { createRestAPIClient } from 'masto';
import { Context, SQSEvent } from 'aws-lambda';
import { generateSummary, SummaryResult } from './summary';

// hatebu/subscriber/index.ts の QueueMessage と合わせること
interface QueueMessage {
  entryAuthor: string;
  entryComment: string;
  entryTitle: string;
  entryUrl: string;
}

const MASTODON_URL = process.env.MASTODON_URL!;
const MASTODON_ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN!;

// Lambda の Timeout まで待たないのは、投稿は済んだのに応答が遅れてタイムアウトすると、SQS の再試行で二重に投稿されるため。
// 記事（10秒）・Bedrock（15秒）と合わせて55秒にし、Timeout（60秒）に収める
const MASTODON_TIMEOUT_MS = 30_000;

// URL を実際の長さで数えないのは、Mastodon が長さによらず23文字と数えるため（インスタンスの configuration.statuses.characters_reserved_per_url）
// https://docs.joinmastodon.org/entities/Instance/#characters_reserved_per_url
// https://github.com/mastodon/mastodon/blob/v4.7.5/app/validators/status_length_validator.rb#L4-L5
const MASTODON_MAX_LENGTH = 500;
const MASTODON_URL_LENGTH = 23;

const mastodonClient = createRestAPIClient({
  url: MASTODON_URL,
  accessToken: MASTODON_ACCESS_TOKEN,
  timeout: MASTODON_TIMEOUT_MS,
});

// BatchSize を 1 にしているので、Records は 1 件だけ届く。
// 上げると、バッチ内の一部が失敗したときに成功した分も再投稿される。
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
    const response = await postToMastodon(await buildStatus(author, comment, title, url));

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

// 要約をコメントの位置に置かないのは、ブックマークした人のコメントと見分けられるようにするため
const buildStatus = async (author: string, comment: string, title: string, url: string): Promise<string> => {
  const status = `[B!] id:${author} ${comment} > ${title} ${url}`.replace(/ +/g, ' ');

  if (comment.trim() !== '') {
    return status;
  }

  let result: SummaryResult;
  try {
    result = await generateSummary(url, title);
  } catch (error) {
    // 投げ直さないのは、FIFO キューで後続の投稿がすべて止まるため
    console.warn('Posting without summary (unexpected-error):', error);
    return status;
  }
  if (!result.ok) {
    console.warn(`Posting without summary (${result.reason}):`, result.detail);
    return status;
  }

  // 長さを確かめずに添えないのは、タイトルの長さがフィード次第のため
  const statusWithSummary = `[B!] ${result.summary} > id:${author} ${title} ${url}`.replace(/ +/g, ' ');
  const length = [...statusWithSummary.replace(url, 'x'.repeat(MASTODON_URL_LENGTH))].length;
  if (length > MASTODON_MAX_LENGTH) {
    console.warn(`Posting without summary (too long: ${length} characters):`, result.summary);
    return status;
  }

  console.info('Posting with summary:', result.summary);
  return statusWithSummary;
};
