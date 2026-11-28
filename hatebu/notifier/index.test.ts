import assert from 'node:assert/strict';
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo, BlockList, IPVersion } from 'node:net';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import type { Context, SQSEvent } from 'aws-lambda';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const MASTODON_URL = 'https://mastodon.example';

// index.ts と summary.ts は読み込み時に環境変数を読むため、静的に import せず、設定してから動的に import する
process.env.MASTODON_URL = MASTODON_URL;
process.env.MASTODON_ACCESS_TOKEN = 'dummy';
process.env.BEDROCK_MODEL_ID = 'dummy';

let handler: typeof import('./index.js').handler;

type ArticleHandler = (request: IncomingMessage, response: ServerResponse) => void;
let articleHandler: ArticleHandler;
let server: Server;
let port: number;

before(async () => {
  ({ handler } = await import('./index.js'));

  server = createServer((request, response) => articleHandler(request, response));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  articleHandler = html('<p>本文</p>');
});

afterEach(() => {
  mock.restoreAll();
  // keep-alive の接続が残ると、次のテストで名前解決されず、私的 IP の拒否を確かめられないため
  server.closeAllConnections();
  delete process.env.BEDROCK_ENABLED;
});

interface Entry {
  entryAuthor: string;
  entryComment: string;
  entryTitle: string;
  entryUrl: string;
}

interface Options {
  // Bedrock の応答の本文（JSON の文字列）
  bedrock?: () => Promise<string>;
  // 私的 IP の拒否から外すアドレス。テストの記事はループバックのサーバーから返すため
  allowedAddresses?: string[];
}

interface Result {
  statuses: string[];
  materials: string[];
  warnings: string[];
}

const html = (body: string, contentType = 'text/html; charset=utf-8'): ArticleHandler => (_request, response) => {
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(body);
};

const articleUrl = (path = '/article'): string => `http://localhost:${port}${path}`;

const entryOf = (overrides: Partial<Entry> = {}): Entry => ({
  entryAuthor: 'someone',
  entryComment: '',
  entryTitle: '記事のタイトル',
  entryUrl: articleUrl(),
  ...overrides,
});

const claudeResponse = (text: string, stopReason = 'end_turn'): string => JSON.stringify({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Bedrock の Anthropic Messages API のフィールド名に合わせる
  stop_reason: stopReason,
  content: [{ type: 'text', text }],
});

const extractMaterial = (command: InvokeModelCommand): string => {
  const body = JSON.parse(command.input.body as string);
  const found = (body.messages[0].content as string).match(/<(article-[^>]+)>\n([\s\S]*)\n<\/\1>$/);
  assert.ok(found, '記事の区切りが見つからない');
  return found[2];
};

const allowAddresses = (addresses: string[]): void => {
  const original = BlockList.prototype.check;
  mock.method(BlockList.prototype, 'check', function (this: BlockList, address: string, type?: IPVersion): boolean {
    return addresses.includes(address) ? false : original.call(this, address, type);
  });
};

const run = async (entry: Entry, options: Options = {}): Promise<Result> => {
  const result: Result = { statuses: [], materials: [], warnings: [] };
  const bedrock = options.bedrock ?? (async () => claudeResponse('要約'));
  allowAddresses(options.allowedAddresses ?? ['127.0.0.1', '::1']);

  mock.method(console, 'info', () => {});
  mock.method(console, 'warn', (...args: unknown[]) => {
    result.warnings.push(args.map(String).join(' '));
  });

  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const request = new Request(input);
    if (request.url.startsWith(`${MASTODON_URL}/`)) {
      result.statuses.push(((await request.json()) as { status: string; }).status);
      return Response.json({ id: '1' });
    }
    throw new Error(`Unexpected fetch: ${request.url}`);
  });

  // Bedrock の SDK は fetch を使わないため、クライアントの send を差し替える
  mock.method(BedrockRuntimeClient.prototype, 'send', async (command: InvokeModelCommand) => {
    result.materials.push(extractMaterial(command));
    return { body: new TextEncoder().encode(await bedrock()) };
  });

  // eslint-disable-next-line @typescript-eslint/naming-convention -- SQS のイベントのフィールド名に合わせる
  const event = { Records: [{ body: JSON.stringify(entry) }] } as SQSEvent;
  await handler(event, {} as Context);
  return result;
};

const withSummary = (summary: string, entry = entryOf()): string =>
  `[B!] ✨ ${summary} > id:${entry.entryAuthor} ${entry.entryTitle} ${entry.entryUrl}`;

const withoutSummary = (entry = entryOf()): string =>
  `[B!] id:${entry.entryAuthor} > ${entry.entryTitle} ${entry.entryUrl}`;

const assertWithoutSummary = (result: Result, reason: string, entry = entryOf()): void => {
  assert.deepEqual(result.statuses, [withoutSummary(entry)]);
  assert.ok(
    result.warnings.some((warning) => warning.includes(`(${reason})`)),
    `${reason} の警告がない: ${JSON.stringify(result.warnings)}`
  );
};

const bodyOf = (material: string): string => material.replace(/^タイトル: .*\n\n/, '');

describe('コメントの有無', () => {
  it('コメントがあれば、要約せずにコメントを添えて投稿する', async () => {
    const entry = entryOf({ entryComment: 'あとで読む' });
    const result = await run(entry);
    assert.deepEqual(result.statuses, [`[B!] id:someone あとで読む > 記事のタイトル ${entry.entryUrl}`]);
    assert.deepEqual(result.materials, []);
  });

  it('コメントがなければ、要約を添えて投稿する', async () => {
    const result = await run(entryOf());
    assert.deepEqual(result.statuses, [withSummary('要約')]);
  });
});

describe('Bedrock を止めたとき', () => {
  it('BEDROCK_ENABLED が false なら要約を添えず、記事も取得しない', async () => {
    process.env.BEDROCK_ENABLED = 'false';
    const article = mock.fn(html('<p>本文</p>'));
    articleHandler = article;
    const result = await run(entryOf());
    assertWithoutSummary(result, 'bedrock-disabled');
    assert.equal(article.mock.callCount(), 0);
    assert.deepEqual(result.materials, []);
  });

  it('BEDROCK_ENABLED が true なら要約を添える', async () => {
    process.env.BEDROCK_ENABLED = 'true';
    const result = await run(entryOf());
    assert.deepEqual(result.statuses, [withSummary('要約')]);
  });
});

describe('記事の本文', () => {
  const materialOf = async (body: string, contentType?: string): Promise<string> => {
    articleHandler = html(body, contentType);
    const result = await run(entryOf());
    assert.equal(result.materials.length, 1);
    return result.materials[0];
  };

  it('タイトルと本文を渡す', async () => {
    assert.equal(await materialOf('<p>本文</p>'), 'タイトル: 記事のタイトル\n\n本文');
  });

  it('タグと、本文にならない要素を取り除く', async () => {
    const body = '<html><head><title>t</title><style>x</style></head><body>' +
      '<script>x</script><p>あ<b>い</b></p><!-- x --><noscript>x</noscript><p>う</p></body></html>';
    assert.equal(bodyOf(await materialOf(body)), 'あ い う');
  });

  it('article の要素があれば、そこから後ろを渡す', async () => {
    assert.equal(bodyOf(await materialOf('<div>メニュー</div><article><p>本文</p></article>')), '本文');
  });

  it('main の要素があれば、そこから後ろを渡す', async () => {
    assert.equal(bodyOf(await materialOf('<div>ヘッダー</div><main><p>本文</p></main>')), '本文');
  });

  it('文字参照を戻す', async () => {
    assert.equal(bodyOf(await materialOf('<p>&lt;a&gt; &amp; &quot;b&quot; &#39;c&#39; &#x3042;&nbsp;d</p>')), '<a> & "b" \'c\' あ d');
  });

  it('--!> で閉じたコメントも取り除く', async () => {
    assert.equal(bodyOf(await materialOf('<p>あ</p><!-- x --!><p>い</p>')), 'あ い');
  });

  it('閉じのない要素は、そこから後ろを捨てる', async () => {
    assert.equal(bodyOf(await materialOf('<p>本文</p><script>x')), '本文');
  });

  it('3000字を超えた分は捨てる', async () => {
    assert.equal(bodyOf(await materialOf(`<p>${'あ'.repeat(3000)}い</p>`)), 'あ'.repeat(3000));
  });

  it('Content-Type の charset で読む', async () => {
    const body = Buffer.from([0x82, 0xa0]); // Shift_JIS の「あ」
    articleHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=Shift_JIS' });
      response.end(body);
    };
    const result = await run(entryOf());
    assert.deepEqual(result.materials.map(bodyOf), ['あ']);
  });

  it('meta の charset で読む', async () => {
    const body = Buffer.concat([Buffer.from('<meta charset="EUC-JP"><p>'), Buffer.from([0xa4, 0xa2]), Buffer.from('</p>')]);
    articleHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(body);
    };
    const result = await run(entryOf());
    assert.deepEqual(result.materials.map(bodyOf), ['あ']);
  });

  it('リダイレクトをたどる', async () => {
    articleHandler = (request, response) => {
      if (request.url === '/article') {
        response.writeHead(301, { location: '/moved' });
        response.end();
        return;
      }
      html('<p>移動先</p>')(request, response);
    };
    const result = await run(entryOf());
    assert.deepEqual(result.materials.map(bodyOf), ['移動先']);
  });
});

describe('私的 IP などの判定', () => {
  let isBlockedAddress: typeof import('./article.js').isBlockedAddress;

  before(async () => {
    ({ isBlockedAddress } = await import('./article.js'));
  });

  const blocked = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.0.0.1', '192.168.0.1',
    '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', 'fc00::1', 'fe80::1', 'ff02::1',
  ];
  for (const address of blocked) {
    it(`${address} は拒否する`, () => {
      assert.equal(isBlockedAddress(address), true);
    });
  }

  const allowed = ['8.8.8.8', '104.18.28.7', '172.66.162.107', '192.0.66.2', '::ffff:8.8.8.8', '2001:4860:4860::8888'];
  for (const address of allowed) {
    it(`${address} は拒否しない`, () => {
      assert.equal(isBlockedAddress(address), false);
    });
  }
});

describe('取得してはいけない URL は、要約なしで投稿する', () => {
  it('名前解決したアドレスが私的 IP', async () => {
    const result = await run(entryOf(), { allowedAddresses: [] });
    assertWithoutSummary(result, 'unsafe-url');
  });

  it('IP アドレスで書かれた私的 IP', async () => {
    const entry = entryOf({ entryUrl: `http://127.0.0.2:${port}/article` });
    const result = await run(entry);
    assertWithoutSummary(result, 'unsafe-url', entry);
  });

  it('IPv6 の IP アドレスで書かれた私的 IP', async () => {
    const entry = entryOf({ entryUrl: `http://[::1]:${port}/article` });
    const result = await run(entry, { allowedAddresses: [] });
    assertWithoutSummary(result, 'unsafe-url', entry);
  });

  it('リダイレクト先が私的 IP', async () => {
    articleHandler = (_request, response) => {
      response.writeHead(302, { location: `http://127.0.0.2:${port}/` });
      response.end();
    };
    const result = await run(entryOf());
    assertWithoutSummary(result, 'unsafe-url');
  });

  it('http と https 以外', async () => {
    const entry = entryOf({ entryUrl: 'ftp://example.com/article' });
    const result = await run(entry);
    assertWithoutSummary(result, 'unsafe-url', entry);
  });
});

describe('出力の検証', () => {
  const rejected = [
    'https://example.com の記事',
    '@user の記事',
    '#tag の記事',
    ':blobcat: の記事',
    'a>b の記事',
    'a\nb の記事',
    '',
    'あ'.repeat(181),
  ];
  for (const text of rejected) {
    it(`${JSON.stringify(text.length > 100 ? `${text.length}字の文` : text)} は使わない`, async () => {
      const result = await run(entryOf(), { bedrock: async () => claudeResponse(text) });
      assertWithoutSummary(result, 'invalid-output');
    });
  }

  it('180字までは使う', async () => {
    const summary = 'あ'.repeat(180);
    const result = await run(entryOf(), { bedrock: async () => claudeResponse(summary) });
    assert.deepEqual(result.statuses, [withSummary(summary)]);
  });

  it('文の間の「。」は残し、末尾の「。」は取り除いて使う', async () => {
    const result = await run(entryOf(), { bedrock: async () => claudeResponse(' 一文目。二文目。 ') });
    assert.deepEqual(result.statuses, [withSummary('一文目。二文目')]);
  });

  it('stop_reason が end_turn でなければ使わない', async () => {
    const result = await run(entryOf(), { bedrock: async () => claudeResponse('要約', 'max_tokens') });
    assertWithoutSummary(result, 'invalid-output');
  });
});

describe('Mastodon の文字数', () => {
  // 「[B!] ✨ 」「 > 」「id:someone 」「 」と URL の23字を合わせて45字
  const summary = 'あ'.repeat(180);
  const entryWithTitle = (titleLength: number): Entry => entryOf({
    entryTitle: 't'.repeat(titleLength),
    // 23字より長い URL でも23字と数えることを確かめる
    entryUrl: articleUrl(`/${'a'.repeat(100)}`),
  });

  it('500字ちょうどなら要約を添える', async () => {
    const entry = entryWithTitle(500 - 45 - 180);
    const result = await run(entry, { bedrock: async () => claudeResponse(summary) });
    assert.deepEqual(result.statuses, [withSummary(summary, entry)]);
  });

  it('501字なら要約なしで投稿する', async () => {
    const entry = entryWithTitle(501 - 45 - 180);
    const result = await run(entry, { bedrock: async () => claudeResponse(summary) });
    assert.deepEqual(result.statuses, [withoutSummary(entry)]);
    assert.ok(result.warnings.some((warning) => warning.includes('(too long: 501 characters)')));
  });
});

describe('記事の取得のタイムアウト', () => {
  it('本文の受信が止まっても、中断して例外になる', { timeout: 5_000 }, async () => {
    const { fetchArticleText } = await import('./article.js');
    allowAddresses(['127.0.0.1', '::1']);
    articleHandler = (_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.flushHeaders();
    };
    await assert.rejects(fetchArticleText(articleUrl(), AbortSignal.timeout(100)));
  });
});

describe('要約を作れないときは要約なしで投稿する', () => {
  it('記事の取得がエラーを返す', async () => {
    articleHandler = (_request, response) => {
      response.writeHead(500);
      response.end();
    };
    assertWithoutSummary(await run(entryOf()), 'article-fetch-failed');
  });

  it('リダイレクトが多すぎる', async () => {
    articleHandler = (_request, response) => {
      response.writeHead(302, { location: '/article' });
      response.end();
    };
    assertWithoutSummary(await run(entryOf()), 'article-fetch-failed');
  });

  it('記事の取得が失敗する', async () => {
    articleHandler = (request) => {
      request.socket.destroy();
    };
    assertWithoutSummary(await run(entryOf()), 'article-fetch-failed');
  });

  it('HTML ではない', async () => {
    articleHandler = html('%PDF-1.7', 'application/pdf');
    assertWithoutSummary(await run(entryOf()), 'no-article');
  });

  it('本文がない', async () => {
    articleHandler = html('<script>x</script>');
    assertWithoutSummary(await run(entryOf()), 'no-article');
  });

  it('記事の内容が読み取れないと答える', async () => {
    assertWithoutSummary(await run(entryOf(), { bedrock: async () => claudeResponse('NO_SUMMARY') }), 'unreadable-article');
  });

  it('Bedrock の呼び出しが失敗する', async () => {
    const result = await run(entryOf(), { bedrock: async () => { throw new Error('ThrottlingException'); } });
    assertWithoutSummary(result, 'bedrock-failed');
  });

  it('Bedrock の応答の形が崩れている', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bedrock の Anthropic Messages API のフィールド名に合わせる
    const result = await run(entryOf(), { bedrock: async () => JSON.stringify({ stop_reason: 'end_turn' }) });
    assertWithoutSummary(result, 'unexpected-error');
  });
});
