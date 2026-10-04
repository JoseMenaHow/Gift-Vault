import { lookup } from 'node:dns/promises';
import net from 'node:net';

const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number);
    return first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }

  const normalized = address.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
}

async function assertPublicUrl(target) {
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Unsupported URL protocol');

  const hostname = target.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private hostnames are not supported');
  }

  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Private network addresses are not supported');
  }
}

async function readHtml(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > MAX_RESPONSE_BYTES) throw new Error('Response is too large');
    chunks.push(value);
  }

  const htmlBytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    htmlBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(htmlBytes);
}

function parseAttributes(tag) {
  const attributes = {};
  const expression = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;

  while ((match = expression.exec(tag))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  }

  return attributes;
}

function getPreviewImageUrl(html, sourceUrl) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || [];

  for (const tag of metaTags) {
    const attributes = parseAttributes(tag);
    const name = (attributes.property || attributes.name || '').toLowerCase();
    if (!['og:image', 'twitter:image', 'twitter:image:src'].includes(name) || !attributes.content) continue;

    const imageUrl = new URL(attributes.content, sourceUrl);
    if (['http:', 'https:'].includes(imageUrl.protocol)) return imageUrl.toString();
  }

  return undefined;
}

export default async function handler(request, response) {
  const requestedUrl = typeof request.query.url === 'string' ? request.query.url : undefined;
  if (!requestedUrl) return response.status(400).json({ error: 'A link is required.' });

  try {
    let target = new URL(requestedUrl);

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      await assertPublicUrl(target);
      const previewResponse = await fetch(target, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Gift Vault link preview',
        },
      });

      if (previewResponse.status >= 300 && previewResponse.status < 400) {
        const nextUrl = previewResponse.headers.get('location');
        if (!nextUrl || redirects === MAX_REDIRECTS) throw new Error('Too many redirects');
        target = new URL(nextUrl, target);
        continue;
      }

      if (!previewResponse.ok) throw new Error('Preview source is unavailable');
      const contentType = previewResponse.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) throw new Error('Preview source is not HTML');

      const imageUrl = getPreviewImageUrl(await readHtml(previewResponse), target);
      response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
      return response.status(200).json({ imageUrl });
    }
  } catch {
    return response.status(200).json({ imageUrl: undefined });
  }

  return response.status(200).json({ imageUrl: undefined });
}
