import { it, expect, vi, afterEach } from 'vitest';
import { ModrinthModpackProvider } from '../apps/api/src/providers/modrinth';
import { CurseForgeModpackProvider } from '../apps/api/src/providers/curseforge';
afterEach(() => vi.unstubAllGlobals());
it('a pesquisa de pacotes Modrinth exige tipo modpack e combina filtros', async () => {
  const fetcher = vi.fn(
    async () => new Response(JSON.stringify({ hits: [], total_hits: 0 }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetcher);
  await new ModrinthModpackProvider(
    'studio-test',
    'https://api.modrinth.com/test-search',
  ).searchModpacks({
    minecraft: '1.20.1',
    loader: 'fabric',
    category: 'adventure',
    sort: 'updated',
  });
  const url = new URL(String(fetcher.mock.calls[0]?.[0]));
  expect(JSON.parse(url.searchParams.get('facets')!)).toEqual([
    ['project_type:modpack'],
    ['versions:1.20.1'],
    ['categories:fabric'],
    ['categories:adventure'],
  ]);
  expect(url.searchParams.get('index')).toBe('updated');
});
it('CurseForge sem chave não consulta a rede', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(new CurseForgeModpackProvider('').searchModpacks({})).rejects.toThrow(
    /CURSEFORGE_API_KEY/,
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('download negado CurseForge permanece bloqueado e preserva dependências obrigatórias', async () => {
  const file = {
    id: 456,
    modId: 123,
    displayName: 'v1',
    fileName: 'test.jar',
    fileDate: '2026-01-01T00:00:00Z',
    fileLength: 10,
    downloadUrl: null,
    hashes: [{ algo: 1, value: 'a'.repeat(40) }],
    gameVersions: ['1.20.1', 'Forge'],
    dependencies: [
      { modId: 999, relationType: 3 },
      { modId: 998, relationType: 2 },
    ],
  };
  const project = {
    id: 123,
    name: 'Test',
    slug: 'test',
    summary: '',
    downloadCount: 1,
    dateModified: '2026-01-01T00:00:00Z',
    logo: null,
    authors: [],
    screenshots: [],
    links: { websiteUrl: 'https://www.curseforge.com/test', sourceUrl: null },
    categories: [],
    latestFiles: [file],
    allowModDistribution: false,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (raw: unknown) => {
      const url = String(raw);
      if (url.endsWith('/download-url')) return new Response('', { status: 403 });
      return new Response(
        JSON.stringify({
          data: url.endsWith('/description')
            ? 'Descrição'
            : url.includes('/files/')
              ? file
              : project,
        }),
        { status: 200 },
      );
    }),
  );
  const provider = new CurseForgeModpackProvider(
    'unit-test-key',
    'https://api.curseforge.com/test-denied',
  );
  const files = await provider.getFiles('123', '456');
  expect(files[0]?.distribution).toBe('blocked');
  expect(files[0]?.downloadUrl).toBeNull();
  expect(files[0]?.hashes.sha1).toBe('a'.repeat(40));
  expect((await provider.getDependencies('123', '456')).filter((d) => d.required)).toHaveLength(1);
});
