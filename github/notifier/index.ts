import { createRestAPIClient } from 'masto';
import { Context, SQSEvent } from 'aws-lambda';
import { sendPushoverMessage } from './pushover';
import { IntroductionResult, generateIntroduction, isStarEvent, parseRepositoryUrl } from './introduction';

// github/subscriber/index.ts の QueueMessage と合わせること
interface QueueMessage {
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

// README（5秒）・Bedrock（15秒）・Mastodon（20秒）・Pushover（10秒）の合計を、Lambda の Timeout（75秒）に余裕をもって収める
const MASTODON_TIMEOUT_MS = 20_000;

// Mastodon は本文の URL を長さによらず23文字と数える（インスタンスの configuration.statuses.characters_reserved_per_url）
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
    await notify(message);
  }
};

const notify = async (message: QueueMessage): Promise<void> => {
  console.info('Starting GitHub notifier with message:', message);

  const { entryTitle, entryUrl } = message;

  // ワークアラウンド: 相対パスの場合は完全なURLに変換
  const processedUrl = entryUrl.startsWith('/')
    ? `https://github.com${entryUrl}`
    : entryUrl;

  if (processedUrl !== entryUrl) {
    console.warn(`[Workaround] Converted relative path to full URL: ${processedUrl}`);
  }

  return await processEntry(entryTitle, processedUrl);
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
  const status = await buildMastodonStatus(title, url, message);

  const mastodonResponse = await postToMastodon(status);
  console.info('Successfully posted to Mastodon:', mastodonResponse);

  // Pushover は best effort（失敗してもエントリーは処理済みとする）
  try {
    const pushoverResponse = await sendPushover(title, message);
    console.info('Successfully sent to Pushover:', pushoverResponse);
  } catch (error) {
    console.warn('Pushover failed (best effort); ignoring:', error);
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
    return await sendPushoverMessage({
      user: PUSHOVER_USER_KEY,
      token: PUSHOVER_APP_TOKEN,
    }, {
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

// スターのイベントには紹介文を添える。紹介文を作れなければ、紹介なしで投稿する
const buildMastodonStatus = async (title: string, url: string, message: string): Promise<string> => {
  const status = `[GH] ${title} ${message}`;

  if (!isStarEvent(title)) {
    return status;
  }

  const repository = parseRepositoryUrl(url);
  if (!repository) {
    console.warn(`Posting without introduction (unexpected repository URL): ${url}`);
    return status;
  }

  let result: IntroductionResult;
  try {
    result = await generateIntroduction(repository);
  } catch (error) {
    // 応答の形が想定と違うなど、generateIntroduction で拾えなかった例外でも紹介なしで投稿する
    console.warn('Posting without introduction (unexpected-error):', error);
    return status;
  }
  if (!result.ok) {
    console.warn(`Posting without introduction (${result.reason}):`, result.detail);
    return status;
  }

  // GitHub の名前の上限を前提にすると、最大でも約340字で収まる。タイトルはフィード次第なので、確認は残す
  const statusWithIntroduction = `[GH] ${result.introduction} > ${title} ${message}`;
  const length = [...statusWithIntroduction.replace(message, 'x'.repeat(MASTODON_URL_LENGTH))].length;
  if (length > MASTODON_MAX_LENGTH) {
    console.warn(`Posting without introduction (too long: ${length} characters):`, result.introduction);
    return status;
  }

  console.info('Posting with introduction:', result.introduction);
  return statusWithIntroduction;
};

const buildMessage = (title: string, url: string): string => {
  const found = title.match(/^([^ ]+) started following/);

  if (found) {
    return `https://github.com/${found[1]}`;
  }

  return url;
};
