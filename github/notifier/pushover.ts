/**
 * Pushover のメッセージ送信 API
 * @see https://pushover.net/api
 */

const PUSHOVER_API_URL = 'https://api.pushover.net/1/messages.json';

// タイムアウトを付けないと、Pushover が応答しないときに Lambda がタイムアウトし、SQS の再試行で Mastodon に二重投稿される
const PUSHOVER_TIMEOUT_MS = 10_000;

interface PushoverCredentials {
  user: string;
  token: string;
}

interface PushoverMessage {
  title: string;
  message: string;
  device?: string;
  priority?: number;
  sound?: string;
}

interface PushoverResponse {
  status: number;
  request: string;
  errors?: string[];
}

export const sendPushoverMessage = async (
  credentials: PushoverCredentials,
  message: PushoverMessage
): Promise<PushoverResponse> => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...credentials, ...message })) {
    if (value !== undefined) {
      params.append(key, String(value));
    }
  }

  const response = await fetch(PUSHOVER_API_URL, {
    method: 'POST',
    body: params,
    signal: AbortSignal.timeout(PUSHOVER_TIMEOUT_MS),
  });

  const body = await response.json().catch(() => undefined) as PushoverResponse | undefined;

  if (!response.ok || body?.status !== 1) {
    throw new Error(`Pushover API error: HTTP ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
};
