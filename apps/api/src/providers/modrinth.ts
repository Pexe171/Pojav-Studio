import { z } from 'zod';
import type {
  Category,
  Dependency,
  ExternalProject,
  ExternalVersion,
  ModpackRepositoryProvider,
  ProviderImport,
  ResolvedFile,
  SearchPage,
  SearchQuery,
} from '@studio/core';
import { hashesSchema, kindFor } from '@studio/core';
import { apiJson } from './http.js';
const id = (value: string) => encodeURIComponent(value);
const file = z.object({
  filename: z.string(),
  url: z.string().url(),
  size: z.number(),
  hashes: hashesSchema,
  primary: z.boolean(),
});
const version = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
  date_published: z.string(),
  files: z.array(file),
  dependencies: z.array(
    z.object({
      project_id: z.string().nullable(),
      version_id: z.string().nullable(),
      dependency_type: z.string(),
    }),
  ),
});
export class ModrinthModpackProvider implements ModpackRepositoryProvider {
  readonly id = 'modrinth' as const;
  constructor(
    private userAgent: string,
    private base = 'https://api.modrinth.com/v2',
  ) {}
  private json<T>(path: string) {
    return apiJson<T>(this.id, `${this.base}${path}`, { 'User-Agent': this.userAgent });
  }
  private normalizeVersion(raw: unknown): ExternalVersion {
    const v = version.parse(raw);
    return {
      provider: this.id,
      projectId: v.project_id,
      id: v.id,
      name: v.name,
      versionNumber: v.version_number,
      minecraftVersions: v.game_versions,
      loaders: v.loaders,
      publishedAt: v.date_published,
      files: v.files.map((f) => ({
        filename: f.filename,
        url: f.url,
        size: f.size,
        hashes: f.hashes,
        primary: f.primary,
      })),
      dependencies: v.dependencies.map((d) => ({
        provider: this.id,
        projectId: d.project_id,
        versionId: d.version_id,
        required: d.dependency_type === 'required',
        incompatible: d.dependency_type === 'incompatible',
      })),
    };
  }
  async searchModpacks(q: SearchQuery): Promise<SearchPage> {
    const facets: string[][] = [[`project_type:${q.type ?? 'modpack'}`]];
    if (q.minecraft) facets.push([`versions:${q.minecraft}`]);
    if (q.loader) facets.push([`categories:${q.loader}`]);
    if (q.category) facets.push([`categories:${q.category}`]);
    const params = new URLSearchParams({
      query: q.query ?? '',
      facets: JSON.stringify(facets),
      limit: String(q.limit ?? 24),
      offset: String(q.offset ?? 0),
      index: (
        {
          popular: 'downloads',
          updated: 'updated',
          newest: 'newest',
          relevance: 'relevance',
        } as const
      )[q.sort ?? 'popular'],
    });
    const data = z
      .object({
        hits: z.array(
          z.object({
            project_id: z.string(),
            slug: z.string(),
            title: z.string(),
            description: z.string(),
            author: z.string(),
            icon_url: z.string().nullable(),
            downloads: z.number(),
            follows: z.number(),
            categories: z.array(z.string()),
            versions: z.array(z.string()),
            date_modified: z.string(),
            gallery: z.array(z.string()).default([]),
          }),
        ),
        total_hits: z.number(),
      })
      .parse(await this.json(`/search?${params}`));
    return {
      items: data.hits.map((h) => ({
        provider: this.id,
        externalProjectId: h.project_id,
        externalVersionId: null,
        name: h.title,
        slug: h.slug,
        icon: h.icon_url,
        authors: [h.author],
        minecraftVersions: h.versions,
        loaders: h.categories.filter((c) => ['forge', 'fabric', 'neoforge', 'quilt'].includes(c)),
        downloads: h.downloads,
        followers: h.follows,
        license: null,
        websiteUrl: `https://modrinth.com/${q.type ?? 'modpack'}/${h.slug}`,
        sourceUrl: null,
        description: h.description,
        descriptionFormat: 'text',
        summary: h.description,
        gallery: h.gallery,
        categories: h.categories,
        updatedAt: h.date_modified,
        modCount: null,
      })),
      total: data.total_hits,
      hasMore: (q.offset ?? 0) + data.hits.length < data.total_hits,
    };
  }
  async getModpack(projectId: string): Promise<ExternalProject> {
    const p = z
      .object({
        id: z.string(),
        slug: z.string(),
        title: z.string(),
        description: z.string(),
        body: z.string(),
        icon_url: z.string().nullable(),
        downloads: z.number(),
        followers: z.number(),
        categories: z.array(z.string()),
        game_versions: z.array(z.string()),
        loaders: z.array(z.string()),
        updated: z.string(),
        source_url: z.string().nullable(),
        project_type: z.string(),
        license: z.object({ id: z.string() }),
        gallery: z.array(z.object({ url: z.string() })),
        team: z.string(),
      })
      .parse(await this.json(`/project/${id(projectId)}`));
    const members = z
      .array(z.object({ user: z.object({ username: z.string() }) }))
      .parse(await this.json(`/team/${id(p.team)}/members`));
    return {
      provider: this.id,
      externalProjectId: p.id,
      externalVersionId: null,
      name: p.title,
      slug: p.slug,
      icon: p.icon_url,
      authors: members.map((m) => m.user.username),
      minecraftVersions: p.game_versions,
      loaders: p.loaders,
      downloads: p.downloads,
      followers: p.followers,
      license: p.license.id,
      websiteUrl: `https://modrinth.com/${p.project_type}/${p.slug}`,
      sourceUrl: p.source_url,
      description: p.body,
      descriptionFormat: 'markdown',
      summary: p.description,
      gallery: p.gallery.map((g) => g.url),
      categories: p.categories,
      updatedAt: p.updated,
      modCount: null,
    };
  }
  async getVersions(projectId: string, q: SearchQuery = {}): Promise<ExternalVersion[]> {
    const params = new URLSearchParams();
    params.set('include_changelog', 'false');
    if (q.minecraft) params.set('game_versions', JSON.stringify([q.minecraft]));
    if (q.loader) params.set('loaders', JSON.stringify([q.loader]));
    return z
      .array(version)
      .parse(await this.json(`/project/${id(projectId)}/version?${params}`))
      .map((v) => this.normalizeVersion(v))
      .filter(
        (v) =>
          (!q.minecraft || v.minecraftVersions.includes(q.minecraft)) &&
          (!q.loader || v.loaders.includes(q.loader)),
      );
  }
  async getVersion(projectId: string, versionId: string) {
    const v = this.normalizeVersion(await this.json(`/version/${id(versionId)}`));
    if (v.projectId !== projectId) throw new Error('A versão não pertence ao projeto');
    return v;
  }
  async getVersionById(versionId: string) {
    return this.normalizeVersion(await this.json(`/version/${id(versionId)}`));
  }
  async getFiles(projectId: string, versionId: string): Promise<ResolvedFile[]> {
    const v = await this.getVersion(projectId, versionId),
      p = await this.getModpack(projectId);
    const primary = v.files.find((f) => f.primary) ?? v.files[0];
    return (primary ? [primary] : []).map((f) => ({
      id: `modrinth:${projectId}:${versionId}:${f.filename}`,
      provider: this.id,
      projectId,
      versionId,
      name: p.name,
      filename: f.filename,
      path: `mods/${f.filename}`,
      downloadUrl: f.url,
      downloads: f.url ? [f.url] : [],
      hashes: f.hashes,
      size: f.size,
      required: true,
      environment: { client: 'required', server: 'required' },
      kind: kindFor(`mods/${f.filename}`),
      distribution: 'origin',
      status: 'pending',
      storageKey: null,
      issue: null,
      minecraftVersions: v.minecraftVersions,
      loaders: v.loaders,
      websiteUrl: p.websiteUrl,
      license: p.license,
      requiredBy: [],
    }));
  }
  async getDependencies(projectId: string, versionId: string): Promise<Dependency[]> {
    return (await this.getVersion(projectId, versionId)).dependencies;
  }
  async importModpack(input: ProviderImport) {
    return this.getVersion(input.projectId, input.versionId);
  }
  async categories(): Promise<Category[]> {
    const data = z
      .array(z.object({ name: z.string(), project_type: z.string() }))
      .parse(await this.json('/tag/category'));
    return data
      .filter((c) => c.project_type === 'modpack')
      .map((c) => ({ id: c.name, name: c.name, provider: this.id }));
  }
  async identifyHash(sha512: string) {
    try {
      return this.normalizeVersion(await this.json(`/version_file/${id(sha512)}?algorithm=sha512`));
    } catch {
      return null;
    }
  }
}
