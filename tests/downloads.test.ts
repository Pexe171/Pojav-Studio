import { it, expect, describe } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkHashes,
  hashFile,
  publicAddress,
  safeDownloadUrl,
} from '../apps/api/src/importer/download';
describe('integridade e destinos externos', () => {
  it('detecta alteração de conteúdo em SHA-1 e SHA-512', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-hash-test-'));
    try {
      const file = join(root, 'mod.jar');
      await writeFile(file, 'original');
      const original = await hashFile(file);
      await writeFile(file, 'alterado');
      const changed = await hashFile(file);
      expect(() => checkHashes(changed, { sha1: original.sha1 })).toThrow(/sha1/);
      expect(() => checkHashes(changed, { sha512: original.sha512 })).toThrow(/sha512/);
      expect(() =>
        checkHashes(original, { sha1: original.sha1?.toUpperCase(), sha512: original.sha512 }),
      ).not.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it.each([
    'http://cdn.modrinth.com/file',
    'https://localhost/file',
    'https://127.0.0.1/file',
    'https://cdn.modrinth.com:444/file',
    'https://name:password@cdn.modrinth.com/file',
    'https://cdn.modrinth.com.attacker.example/file',
  ])('nega URL fora das origens permitidas %s', async (url) =>
    expect(safeDownloadUrl(url)).rejects.toThrow(),
  );
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
    '198.18.0.1',
    '198.19.255.254',
    '198.51.100.1',
    '203.0.113.1',
    '192.0.2.1',
    '192.88.99.1',
    '8.8.8.8.invalid',
    '999.8.8.8',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    '2001:0000:4136:e378::1',
    '2001:db8::1',
    '3fff::1',
  ])('nega endereço reservado %s', (ip) => expect(publicAddress(ip)).toBe(false));
  it.each(['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888', '2606:4700::1111'])(
    'aceita endereço público %s',
    (ip) => expect(publicAddress(ip)).toBe(true),
  );
});
