import { z } from 'zod';
import type { ExternalProject, Provider, SearchQuery } from '@studio/core';
import { providers } from '../providers/registry.js';
export const searchSchema = z.object({
  query: z.string().max(200).optional(),
  minecraft: z.string().max(30).optional(),
  loader: z.enum(['forge', 'fabric', 'neoforge', 'quilt', 'vanilla']).optional(),
  category: z.string().max(100).optional(),
  sort: z.enum(['popular', 'updated', 'relevance', 'newest']).default('popular'),
  provider: z.enum(['all', 'modrinth', 'curseforge', 'local']).default('all'),
  type: z.enum(['modpack', 'mod']).default('modpack'),
  cursor: z.string().max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
});
const cursorSchema = z.object({
  signature: z.string(),
  offsets: z.record(z.number().int().min(-1).max(10000000)),
  buffer: z
    .array(
      z.object({
        provider: z.enum(['modrinth', 'curseforge', 'local']),
        externalProjectId: z.string(),
      }),
    )
    .max(144)
    .default([]),
});
export async function searchCatalog(input: unknown, externalOnly = false) {
  const q = searchSchema.parse(input);
  const signature = JSON.stringify([
    externalOnly,
    q.query,
    q.minecraft,
    q.loader,
    q.category,
    q.sort,
    q.provider,
    q.type,
    q.limit,
  ]);
  let state: z.infer<typeof cursorSchema> = { signature, offsets: {}, buffer: [] };
  if (q.cursor) {
    try {
      state = cursorSchema.parse(JSON.parse(Buffer.from(q.cursor, 'base64url').toString()));
    } catch {
      throw new Error('Cursor de paginação inválido');
    }
    if (state.signature !== signature) throw new Error('Cursor pertence a outros filtros');
  }
  let sources: Provider[] =
    q.provider === 'all'
      ? q.type === 'mod'
        ? ['modrinth', 'curseforge']
        : ['modrinth', 'curseforge', 'local']
      : [q.provider];
  if (q.category?.includes(':')) sources = sources.filter((p) => q.category!.startsWith(`${p}:`));
  if (externalOnly) sources = sources.filter((p) => p !== 'local');
  const issues: { provider: Provider; message: string }[] = [];
  // Buffered cards are fetched again through providers; untrusted cursors never carry rendered metadata.
  const buffered = await Promise.allSettled(
    state.buffer
      .filter((r) => sources.includes(r.provider))
      .map((r) => providers[r.provider].getModpack(r.externalProjectId)),
  );
  const items: ExternalProject[] = [];
  for (const result of buffered) if (result.status === 'fulfilled') items.push(result.value);
  const needed = sources.filter(
    (p) => state.offsets[p] !== -1 && items.filter((x) => x.provider === p).length < q.limit,
  );
  const pages = await Promise.allSettled(
    needed.map((p) =>
      providers[p].searchModpacks({
        ...q,
        category: q.category?.startsWith(`${p}:`)
          ? q.category.slice(p.length + 1)
          : q.category?.includes(':')
            ? undefined
            : q.category,
        offset: state.offsets[p] ?? 0,
        limit: q.limit,
      }),
    ),
  );
  const nextOffsets = { ...state.offsets };
  let total = 0;
  for (let i = 0; i < pages.length; i++) {
    const result = pages[i]!,
      p = needed[i]!;
    if (result.status === 'fulfilled') {
      items.push(...result.value.items);
      total += result.value.total;
      nextOffsets[p] = result.value.hasMore
        ? (state.offsets[p] ?? 0) + result.value.items.length
        : -1;
    } else {
      nextOffsets[p] = -1;
      issues.push({
        provider: p,
        message: result.reason instanceof Error ? result.reason.message : 'Origem indisponível',
      });
    }
  }
  const more = sources.some((p) => nextOffsets[p] !== -1);
  const unique = [
    ...new Map(items.map((x) => [`${x.provider}:${x.externalProjectId}`, x])).values(),
  ];
  if (q.sort === 'popular') unique.sort((a, b) => b.downloads - a.downloads);
  else if (q.sort === 'updated' || q.sort === 'newest')
    unique.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const shown = unique.slice(0, q.limit),
    left = unique.slice(q.limit);
  const next =
    more || left.length
      ? Buffer.from(
          JSON.stringify({
            signature,
            offsets: nextOffsets,
            buffer: left.map((x) => ({
              provider: x.provider,
              externalProjectId: x.externalProjectId,
            })),
          }),
        ).toString('base64url')
      : null;
  return { items: shown, total, nextCursor: next, issues };
}
export async function catalogCategories() {
  const result = await Promise.allSettled([
    providers.modrinth.categories(),
    providers.curseforge.categories(),
  ]);
  return { items: result.flatMap((x) => (x.status === 'fulfilled' ? x.value : [])) };
}
