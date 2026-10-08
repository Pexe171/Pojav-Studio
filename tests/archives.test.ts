import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { readArchive } from '../apps/api/src/importer/archive';
type Entry = {
  name: string;
  content?: Buffer;
  flags?: number;
  mode?: number;
  compressed?: boolean;
};
function archive(entries: Entry[]) {
  const locals: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name),
      content = entry.content ?? Buffer.from('content');
    const data = entry.compressed ? deflateRawSync(content) : content;
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(entry.compressed ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(entry.compressed ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? 0x81a4) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(directory),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
async function read(entries: Entry[], maxBytes = 10485760, maxEntries = 100) {
  const root = await mkdtemp(join(tmpdir(), 'studio-zip-security-'));
  try {
    const file = join(root, 'pack.zip');
    await writeFile(file, archive(entries));
    return await readArchive(file, { maxBytes, maxEntries });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
describe('real ZIP security checks', () => {
  it('reads supported regular files', async () =>
    expect(
      (await read([{ name: 'overrides/config/a.txt' }])).get('overrides/config/a.txt')?.toString(),
    ).toBe('content'));
  it.each([
    '../outside.txt',
    '/outside.txt',
    'C:/outside.txt',
    'overrides/../outside.txt',
    'overrides\\outside.txt',
  ])('rejects traversal %s', (name) => expect(read([{ name }])).rejects.toThrow());
  it('rejects symlinks', () =>
    expect(read([{ name: 'overrides/link', mode: 0xa1ff }])).rejects.toThrow(/Links/));
  it('rejects encrypted entries', () =>
    expect(read([{ name: 'secret.txt', flags: 1, compressed: true }])).rejects.toThrow(
      /criptografado/,
    ));
  it('rejects case-insensitive duplicate paths', () =>
    expect(read([{ name: 'config/A.txt' }, { name: 'config/a.txt' }])).rejects.toThrow(
      /duplicada/,
    ));
  it('rejects expansion exceeding the byte limit', () =>
    expect(read([{ name: 'config/a.txt', content: Buffer.alloc(20) }], 10)).rejects.toThrow(
      /expansão/,
    ));
  it('rejects too many entries', () =>
    expect(read([{ name: 'a.txt' }, { name: 'b.txt' }], 100, 1)).rejects.toThrow(/entradas/));
  it('rejects a compression bomb before decompression', () =>
    expect(
      read([{ name: 'bomb.txt', compressed: true, content: Buffer.alloc(4 * 1048576, 65) }]),
    ).rejects.toThrow(/compressão/));
});
