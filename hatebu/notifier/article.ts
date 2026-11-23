import { lookup as dnsLookup } from 'node:dns';
import { IncomingMessage, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, LookupFunction } from 'node:net';

export class UnsafeUrlError extends Error {}

// 数十 KiB で打ち切らないのは、head だけで数百 KiB になるページがあり、本文に届かないため
const ARTICLE_MAX_BYTES = 1024 * 1024;
const ARTICLE_MAX_LENGTH = 3000;
const MAX_REDIRECTS = 3;

// User-Agent を省かないのは、ないと拒否するサイトがあるため
const USER_AGENT = 'Mozilla/5.0 (compatible)';

// URL を無条件に取得しないのは、第三者が選べる URL で Lambda の Runtime API（127.0.0.1:9001）などに届くため。
// 私的 IP だけでなく NAT64 や 6to4 も拒否するのは、IPv4 のアドレスを埋め込めるため。
// IPv4 射影アドレス（::ffff:0:0/96）を入れないのは、BlockList が IPv4 のルールで照合し、入れるとすべての IPv4 を拒否するため
const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

const NON_CONTENT_ELEMENTS = [
  'head', 'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'aside',
];

const NAMED_CHARACTER_REFERENCES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

export const fetchArticleText = async (url: string, signal: AbortSignal): Promise<string | undefined> => {
  const response = await getFollowingRedirects(new URL(url), signal);

  const status = response.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    response.destroy();
    throw new Error(`Article fetch error: HTTP ${status}`);
  }

  const contentType = response.headers['content-type'] ?? '';
  if (!/^\s*(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)) {
    response.destroy();
    return undefined;
  }

  const html = decode(await readLimitedBytes(response, ARTICLE_MAX_BYTES), contentType);
  const text = extractText(html);
  return text === '' ? undefined : text;
};

// リダイレクトを自動でたどらないのは、リダイレクト先も確かめるため
const getFollowingRedirects = async (url: URL, signal: AbortSignal): Promise<IncomingMessage> => {
  let current = url;
  for (let redirects = 0; ; redirects++) {
    assertSafeUrl(current);
    const response = await get(current, signal);

    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (status < 300 || status >= 400 || location === undefined) {
      return response;
    }
    response.destroy();
    if (redirects >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects: ${url}`);
    }
    current = new URL(location, current);
  }
};

// safeLookup だけに任せないのは、IP アドレスで書かれたホストは名前解決されないため
const assertSafeUrl = (url: URL): void => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Unsupported protocol: ${url}`);
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new UnsafeUrlError(`Blocked address: ${url}`);
  }
};

export const isBlockedAddress = (address: string): boolean =>
  BLOCKED_ADDRESSES.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');

// 事前に名前解決して確かめないのは、接続するまでの間にアドレスが変わりうるため
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '');
      return;
    }
    const blocked = addresses.find(({ address }) => isBlockedAddress(address));
    if (blocked) {
      callback(new UnsafeUrlError(`Blocked address: ${hostname} -> ${blocked.address}`), '');
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    callback(null, addresses[0].address, addresses[0].family);
  });
};

const get = (url: URL, signal: AbortSignal): Promise<IncomingMessage> => new Promise((resolve, reject) => {
  const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
    lookup: safeLookup,
    signal,
    headers: { 'User-Agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
  }, resolve);
  request.on('error', reject);
  request.end();
});

const readLimitedBytes = async (body: IncomingMessage, maxBytes: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of body as AsyncIterable<Buffer>) {
    const part = chunk.subarray(0, maxBytes - total);
    chunks.push(part);
    total += part.length;
    if (total >= maxBytes) {
      break;
    }
  }
  body.destroy();

  return Buffer.concat(chunks);
};

// UTF-8 と決めつけないのは、Shift_JIS や EUC-JP の記事もあるため
const decode = (bytes: Buffer, contentType: string): string => {
  const charset = contentType.match(/charset=["']?([^;"'\s]+)/i)?.[1] ??
    bytes.subarray(0, 1024).toString('latin1').match(/<meta[^>]+charset=["']?([^"'\s/>;]+)/i)?.[1];

  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
};

// Readability などで本文だけを取り出さないのは、依存を増やさないため。残るノイズは要約に任せる
const extractText = (html: string): string => {
  let text = removeSpans(html, '<!--', '--!?>');
  for (const tagName of NON_CONTENT_ELEMENTS) {
    text = removeSpans(text, `<${tagName}\\b`, `</${tagName}\\s*>`);
  }

  const start = text.search(/<(?:article|main)\b/i);
  if (start !== -1) {
    text = text.slice(start);
  }

  // [^<>] にするのは、閉じのない「<」が多いと2乗の時間がかかるため
  text = decodeCharacterReferences(text.replace(/<[^<>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

  return [...text.slice(0, ARTICLE_MAX_LENGTH * 2)].slice(0, ARTICLE_MAX_LENGTH).join('');
};

// 正規表現の [\s\S]*? は閉じのない開始が多いと2乗の時間がかかるため、開始と終了を順に探して線形に走査する
const removeSpans = (text: string, openPattern: string, closePattern: string): string => {
  const open = new RegExp(openPattern, 'gi');
  const close = new RegExp(closePattern, 'gi');
  let result = '';
  let position = 0;

  for (;;) {
    open.lastIndex = position;
    const start = open.exec(text);
    if (!start) {
      return result + text.slice(position);
    }
    result += `${text.slice(position, start.index)} `;

    close.lastIndex = start.index + start[0].length;
    const end = close.exec(text);
    if (!end) {
      return result;
    }
    position = end.index + end[0].length;
  }
};

const decodeCharacterReferences = (text: string): string =>
  text.replace(/&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));/gi, (reference, hex?: string, dec?: string, name?: string) => {
    if (name !== undefined) {
      return NAMED_CHARACTER_REFERENCES[name.toLowerCase()] ?? reference;
    }
    const codePoint = hex !== undefined ? parseInt(hex, 16) : Number(dec);
    return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : reference;
  });
