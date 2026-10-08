import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Hashes } from '@studio/core';
const hosts = [
  'cdn.modrinth.com',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'gitlab.com',
  'mediafilez.forgecdn.net',
  'edge.forgecdn.net',
  'media.forgecdn.net',
];
export function publicAddress(ip: string) {
  if (ip.includes(':')) {
    const s = ip.toLowerCase();
    return (
      !s.startsWith('::') &&
      !s.startsWith('fc') &&
      !s.startsWith('fd') &&
      !/^fe[89ab]/.test(s) &&
      !s.startsWith('ff') &&
      !s.startsWith('2001:db8:')
    );
  }
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a !== 169 &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && [0, 168].includes(b)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    a < 224
  );
}
export async function safeDownloadUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !hosts.includes(url.hostname)
  )
    throw new Error('URL de download não autorizada');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error('Destino de rede não permitido');
  return url;
}
export function checkHashes(actual: Hashes, expected: Hashes) {
  for (const [algo, hash] of Object.entries(expected)) {
    if (hash && actual[algo as keyof Hashes]?.toLowerCase() !== hash.toLowerCase())
      throw new Error(`Falha de integridade ${algo}`);
  }
}
export async function hashFile(path: string): Promise<Hashes> {
  const algorithms = ['sha1', 'sha512', 'sha256', 'md5'] as const,
    hashers = Object.fromEntries(algorithms.map((a) => [a, createHash(a)]));
  for await (const chunk of createReadStream(path))
    for (const h of Object.values(hashers)) h.update(chunk);
  return Object.fromEntries(algorithms.map((a) => [a, hashers[a]!.digest('hex')]));
}
export async function downloadToFile(
  urls: string[],
  destination: string,
  expected: Hashes,
  maxBytes: number,
  expectedSize?: number,
  cancelled?: () => Promise<void>,
): Promise<{ hashes: Hashes; size: number }> {
  let last: unknown = new Error('Nenhum download autorizado disponível');
  for (const source of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await cancelled?.();
        let url = await safeDownloadUrl(source);
        let response: Response | undefined;
        for (let redirects = 0; redirects <= 5; redirects++) {
          response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(300000) });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            await response.body?.cancel();
            if (!location || redirects === 5) throw new Error('Redirecionamento inválido');
            url = await safeDownloadUrl(new URL(location, url).href);
            continue;
          }
          break;
        }
        if (!response?.ok || !response.body)
          throw new Error(`Download indisponível (HTTP ${response?.status})`);
        const contentLength = Number(response.headers.get('content-length'));
        if (contentLength > maxBytes) {
          await response.body.cancel();
          throw new Error('Download excede o limite');
        }
        let size = 0;
        let lastCheck = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length;
            if (size > maxBytes) return callback(new Error('Download excede o limite'));
            const next = () => callback(null, chunk);
            if (Date.now() - lastCheck > 1000 && cancelled) {
              lastCheck = Date.now();
              cancelled().then(next, callback);
            } else next();
          },
        });
        await pipeline(
          Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
          limiter,
          createWriteStream(destination, { flags: 'w' }),
        );
        if (expectedSize !== undefined && size !== expectedSize)
          throw new Error('Tamanho do download diverge do manifest');
        const hashes = await hashFile(destination);
        checkHashes(hashes, expected);
        return { size, hashes };
      } catch (error) {
        last = error;
        await rm(destination, { force: true });
        if (error instanceof Error && error.message === 'Importação cancelada') throw error;
      }
    }
  }
  throw last;
}
