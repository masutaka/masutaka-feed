import assert from 'node:assert/strict';
import { afterEach, before, describe, it, mock } from 'node:test';
import type { Context, SQSEvent } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const MASTODON_URL = 'https://mastodon.example';

// index.ts と introduction.ts は読み込み時に環境変数を読むため、静的に import せず、設定してから動的に import する。
// 正規表現を空にしないのは、空の正規表現がすべてに一致するため
process.env.ITEM_TITLE_IGNORE_REGEXP = '(?!)';
process.env.ITEM_URL_IGNORE_REGEXP = '(?!)';
process.env.ITEM_TITLE_PUSHOVER_REGEXP = '(?!)';
process.env.MASTODON_URL = MASTODON_URL;
process.env.MASTODON_ACCESS_TOKEN = 'dummy';
process.env.PUSHOVER_USER_KEY = 'dummy';
process.env.PUSHOVER_APP_TOKEN = 'dummy';
process.env.BEDROCK_MODEL_ID = 'dummy';

let handler: typeof import('./index.js').handler;

before(async () => {
  ({ handler } = await import('./index.js'));
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.BEDROCK_ENABLED;
});

interface Entry {
  entryId: string;
  entryTitle: string;
  entryUrl: string;
}

interface Fakes {
  readme: () => Promise<Response>;
  // Bedrock の応答の本文（JSON の文字列）
  bedrock: () => Promise<string>;
}

interface Result {
  statuses: string[];
  readmes: string[];
  warnings: string[];
}

const STAR: Entry = {
  entryId: 'tag:github.com,2008:star/1',
  entryTitle: 'masutaka starred owner/repo',
  entryUrl: 'https://github.com/owner/repo',
};

const claudeResponse = (text: string, stopReason = 'end_turn'): string => JSON.stringify({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Bedrock の Anthropic Messages API のフィールド名に合わせる
  stop_reason: stopReason,
  content: [{ type: 'text', text }],
});

const extractReadme = (command: InvokeModelCommand): string => {
  const body = JSON.parse(command.input.body as string);
  const found = (body.messages[0].content as string).match(/<(readme-[^>]+)>\n([\s\S]*)\n<\/\1>$/);
  assert.ok(found, 'README の区切りが見つからない');
  return found[2];
};

const run = async (entry: Entry, fakes: Partial<Fakes> = {}): Promise<Result> => {
  const result: Result = { statuses: [], readmes: [], warnings: [] };
  const readme = fakes.readme ?? (async () => new Response('# README'));
  const bedrock = fakes.bedrock ?? (async () => claudeResponse('紹介文'));

  mock.method(console, 'info', () => {});
  mock.method(console, 'warn', (...args: unknown[]) => {
    result.warnings.push(args.map(String).join(' '));
  });

  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const request = new Request(input);
    if (new URL(request.url).hostname === 'raw.githubusercontent.com') {
      return await readme();
    }
    if (request.url.startsWith(`${MASTODON_URL}/`)) {
      result.statuses.push(((await request.json()) as { status: string; }).status);
      return Response.json({ id: '1' });
    }
    throw new Error(`Unexpected fetch: ${request.url}`);
  });

  // Bedrock の SDK は fetch を使わないため、クライアントの send を差し替える
  mock.method(BedrockRuntimeClient.prototype, 'send', async (command: InvokeModelCommand) => {
    result.readmes.push(extractReadme(command));
    return { body: new TextEncoder().encode(await bedrock()) };
  });

  // eslint-disable-next-line @typescript-eslint/naming-convention -- SQS のイベントのフィールド名に合わせる
  const event = { Records: [{ body: JSON.stringify(entry) }] } as SQSEvent;
  await handler(event, {} as Context);
  return result;
};

const withIntroduction = (introduction: string, entry = STAR): string =>
  `[GH] ${introduction} > ${entry.entryTitle} ${entry.entryUrl}`;

const withoutIntroduction = (entry = STAR): string =>
  `[GH] ${entry.entryTitle} ${entry.entryUrl}`;

const assertWithoutIntroduction = (result: Result, reason: string): void => {
  assert.deepEqual(result.statuses, [withoutIntroduction()]);
  assert.ok(
    result.warnings.some((warning) => warning.includes(`(${reason})`)),
    `${reason} の警告がない: ${JSON.stringify(result.warnings)}`
  );
};

describe('イベントの種類', () => {
  for (const kind of ['star', 'ForkEvent', 'visibility_repo']) {
    it(`${kind} のイベントには紹介文を添える`, async () => {
      const entry = { ...STAR, entryId: `tag:github.com,2008:${kind}/1` };
      const result = await run(entry);
      assert.deepEqual(result.statuses, [withIntroduction('紹介文', entry)]);
    });
  }

  it('ほかのイベントには紹介文を添えず、README も取得しない', async () => {
    const entry = { ...STAR, entryId: 'tag:github.com,2008:CreateEvent/1' };
    const readme = mock.fn(async () => new Response('# README'));
    const result = await run(entry, { readme });
    assert.deepEqual(result.statuses, [withoutIntroduction(entry)]);
    assert.equal(readme.mock.callCount(), 0);
  });

  for (const kind of ['pr_merged', 'publish_release']) {
    it(`${kind} のイベントは投稿しない`, async () => {
      const result = await run({ ...STAR, entryId: `tag:github.com,2008:${kind}/1` });
      assert.deepEqual(result.statuses, []);
    });
  }
});

describe('Bedrock を止めたとき', () => {
  it('BEDROCK_ENABLED が false なら紹介文を添えず、README も取得しない', async () => {
    process.env.BEDROCK_ENABLED = 'false';
    const readme = mock.fn(async () => new Response('# README'));
    const result = await run(STAR, { readme });
    assertWithoutIntroduction(result, 'bedrock-disabled');
    assert.equal(readme.mock.callCount(), 0);
    assert.deepEqual(result.readmes, []);
  });

  it('BEDROCK_ENABLED が true なら紹介文を添える', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    const result = await run(STAR);
    assert.deepEqual(result.statuses, [withIntroduction('紹介文')]);
  });
});

describe('HTML コメントの除去', () => {
  const readmeOf = async (text: string): Promise<string[]> =>
    (await run(STAR, { readme: async () => new Response(text) })).readmes;

  it('複数のコメントを取り除く', async () => {
    assert.deepEqual(await readmeOf('a<!-- x -->b<!--\ny\n-->c'), ['abc']);
  });

  it('閉じのないコメントから後ろを捨てる', async () => {
    assert.deepEqual(await readmeOf('a<!-- x -->b<!-- y'), ['ab']);
  });

  it('16 KiB を超えた分は捨てる', async () => {
    assert.deepEqual(await readmeOf(`${'a'.repeat(16 * 1024)}b`), ['a'.repeat(16 * 1024)]);
  });

  it('16 KiB の境界をまたぐコメントは、閉じのないコメントとして捨てる', async () => {
    const text = `${'a'.repeat(16 * 1024 - 5)}<!-- x -->b`;
    assert.deepEqual(await readmeOf(text), ['a'.repeat(16 * 1024 - 5)]);
  });

  it('コメントだけの README は、README なしとして紹介なしで投稿する', async () => {
    const result = await run(STAR, { readme: async () => new Response('<!-- x -->\n') });
    assert.deepEqual(result.readmes, []);
    assertWithoutIntroduction(result, 'no-readme');
  });
});

describe('出力の検証', () => {
  // 長い文は字数だけにし、不可視の文字はコードポイントで表す
  const label = (text: string): string => {
    const length = [...text].length;
    if (length > 100) {
      return `${length}字の文`;
    }
    return JSON.stringify(text).replace(/[\p{Cf}\u2028\u2029]/gu, (c) => `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}`);
  };

  const rejected = [
    'https://example.com のツール',
    'HTTP://example.com のツール',
    'gemini://example.com のツール',
    'ipfs://example のツール',
    'xmpp:user@example.com のツール',
    'magnet:?xt=urn:btih:x のツール',
    '@user のツール',
    '＠user のツール',
    '#tag のツール',
    '＃tag のツール',
    ':blobcat: のツール',
    'a<b のツール',
    'a>b のツール',
    'a＜b のツール',
    'a＞b のツール',
    'a\nb のツール',
    'a\u0007b のツール',
    'a​b のツール',
    'a\u2028b のツール',
    '',
    ' ',
    'あ'.repeat(121),
  ];
  for (const text of rejected) {
    it(`${label(text)} は使わない`, async () => {
      const result = await run(STAR, { bedrock: async () => claudeResponse(text) });
      assertWithoutIntroduction(result, 'invalid-output');
    });
  }

  const accepted = [
    '12:30:00 に動くツール',
    'example.com のツール',
    'あ'.repeat(120),
    // サロゲートペアも1字と数える
    '𩸽'.repeat(120),
  ];
  for (const text of accepted) {
    it(`${label(text)} は使う`, async () => {
      const result = await run(STAR, { bedrock: async () => claudeResponse(text) });
      assert.deepEqual(result.statuses, [withIntroduction(text)]);
    });
  }

  it('前後の空白は取り除いて使う', async () => {
    const result = await run(STAR, { bedrock: async () => claudeResponse(' 紹介文 ') });
    assert.deepEqual(result.statuses, [withIntroduction('紹介文')]);
  });

  it('末尾の「。」は取り除いて使う', async () => {
    const result = await run(STAR, { bedrock: async () => claudeResponse('紹介文。') });
    assert.deepEqual(result.statuses, [withIntroduction('紹介文')]);
  });

  it('stop_reason が end_turn でなければ使わない', async () => {
    const result = await run(STAR, { bedrock: async () => claudeResponse('紹介文', 'max_tokens') });
    assertWithoutIntroduction(result, 'invalid-output');
  });
});

describe('Mastodon の文字数', () => {
  // 「[GH] 」「 > 」「 」と URL の23字を合わせて32字
  const introduction = 'あ'.repeat(120);
  const entryOf = (titleLength: number): Entry => ({
    ...STAR,
    entryTitle: 't'.repeat(titleLength),
    // 23字より長い URL でも23字と数えることを確かめる
    entryUrl: `https://github.com/owner/${'r'.repeat(100)}`,
  });

  it('500字ちょうどなら紹介文を添える', async () => {
    const entry = entryOf(500 - 32 - 120);
    const result = await run(entry, { bedrock: async () => claudeResponse(introduction) });
    assert.deepEqual(result.statuses, [withIntroduction(introduction, entry)]);
  });

  it('501字なら紹介なしで投稿する', async () => {
    const entry = entryOf(501 - 32 - 120);
    const result = await run(entry, { bedrock: async () => claudeResponse(introduction) });
    assert.deepEqual(result.statuses, [withoutIntroduction(entry)]);
    assert.ok(result.warnings.some((warning) => warning.includes('(too long: 501 characters)')));
  });
});

describe('紹介文を作れないときは紹介なしで投稿する', () => {
  it('README がない', async () => {
    const result = await run(STAR, { readme: async () => new Response('Not Found', { status: 404 }) });
    assertWithoutIntroduction(result, 'no-readme');
  });

  it('README の取得がエラーを返す', async () => {
    const result = await run(STAR, { readme: async () => new Response('Error', { status: 500 }) });
    assertWithoutIntroduction(result, 'readme-fetch-failed');
  });

  it('README の取得が失敗する', async () => {
    const result = await run(STAR, { readme: async () => { throw new TypeError('fetch failed'); } });
    assertWithoutIntroduction(result, 'readme-fetch-failed');
  });

  it('Bedrock の呼び出しが失敗する', async () => {
    const result = await run(STAR, { bedrock: async () => { throw new Error('ThrottlingException'); } });
    assertWithoutIntroduction(result, 'bedrock-failed');
  });

  it('Bedrock の応答の形が崩れている', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bedrock の Anthropic Messages API のフィールド名に合わせる
    const result = await run(STAR, { bedrock: async () => JSON.stringify({ stop_reason: 'end_turn' }) });
    assertWithoutIntroduction(result, 'unexpected-error');
  });
});
