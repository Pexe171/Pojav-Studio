import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { bundleSchema, providerSchema, pathSchema } from '@studio/core';
import { env } from './config.js';
import { db, putObject, objectUrl } from './infra.js';
import { login, logout } from './auth.js';
import { providers } from './providers/registry.js';
import { catalogCategories, searchCatalog, searchSchema } from './services/catalog.js';
import { cancelJob, getJob, importRequest, queueImport, uploadKey } from './services/jobs.js';
import * as projects from './services/projects.js';
import { queueLauncherBuild } from './services/android.js';
import {
  publicCatalog,
  submitDiagnostic,
  listDiagnostics,
  updateDiagnostic,
  performanceSuggestions,
} from './services/launcher.js';
const identifiers = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const requiredFile = (file: Express.Multer.File | undefined) => {
  if (!file) throw new BadRequestException('Selecione um arquivo');
  return file;
};
@Controller('api/v1')
export class ApiController {
  @Get('health') async health() {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'Amethyst Studio' };
  }
  @Post('auth/login') login(@Body() input: unknown, @Res({ passthrough: true }) res: Response) {
    return login(input, res);
  }
  @Post('auth/logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return logout(req, res);
  }
  @Get('auth/me') async me(@Req() req: Request) {
    const admin = await db.admin.findUniqueOrThrow({
      where: { id: (req as Request & { adminId: string }).adminId },
    });
    return { email: admin.email };
  }
  @Get('settings') settings() {
    return {
      curseforgeConfigured: !!env.CURSEFORGE_API_KEY,
      buildEnabled: env.BUILD_ENABLED,
      validatedTargets: env.ANDROID_VALIDATED_TARGETS,
    };
  }
  @Get('projects/:id/performance') performance(@Param('id') id: string) {
    return performanceSuggestions(identifiers.parse(id));
  }
  @Get('catalog/modpacks') catalog(@Query() input: unknown) {
    return searchCatalog(input);
  }
  @Get('catalog/categories') categories() {
    return catalogCategories();
  }
  @Get('catalog/modpacks/:provider/:id') details(
    @Param('provider') provider: string,
    @Param('id') id: string,
  ) {
    return providers[providerSchema.parse(provider)].getModpack(identifiers.parse(id));
  }
  @Get('catalog/modpacks/:provider/:id/versions') versions(
    @Param('provider') provider: string,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const q = searchSchema.parse(query);
    return providers[providerSchema.parse(provider)].getVersions(identifiers.parse(id), q);
  }
  @Post('imports') async prepare(
    @Body() input: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = importRequest.parse(input);
    if (parsed.uploadKey)
      throw new BadRequestException('Use o endpoint de upload para arquivos locais');
    res.status(202);
    return queueImport(parsed);
  }
  @Post('imports/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 536870912, files: 1 } }))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = requiredFile(file);
    const extension = /\.(mrpack|zip|json)$/i.exec(value.originalname)?.[0];
    if (!extension) throw new BadRequestException('Use .mrpack, .zip CurseForge ou .modpack.json');
    if (value.size > env.IMPORT_MAX_ARCHIVE_BYTES)
      throw new BadRequestException('Arquivo muito grande');
    const key = uploadKey(extension);
    await putObject(key, value.buffer);
    res.status(202);
    return queueImport({ provider: 'local', uploadKey: key, operation: 'prepare' });
  }
  @Get('jobs') jobs() {
    return db.job.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }
  @Get('jobs/:id') job(@Param('id') id: string) {
    return getJob(identifiers.parse(id));
  }
  @Post('jobs/:id/cancel') cancel(@Param('id') id: string) {
    return cancelJob(identifiers.parse(id));
  }
  @Post('jobs/:id/commit') commit(@Param('id') id: string, @Body() input: unknown) {
    return projects.commitImport(identifiers.parse(id), input);
  }
  @Get('jobs/:id/events') async events(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    identifiers.parse(id);
    await getJob(id);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let busy = false;
    const send = async () => {
      if (busy) return;
      busy = true;
      try {
        const job = await getJob(id);
        res.write(`data: ${JSON.stringify(job)}\n\n`);
        if (['ready', 'committed', 'failed', 'cancelled'].includes(job.status)) {
          clearInterval(timer);
          res.end();
        }
      } catch {
        clearInterval(timer);
        res.end();
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void send(), 1000);
    req.on('close', () => clearInterval(timer));
    await send();
  }
  @Get('projects') projects() {
    return db.project.findMany({ orderBy: { updatedAt: 'desc' } });
  }
  @Get('projects/:id') async project(@Param('id') id: string) {
    return db.project.findUniqueOrThrow({
      where: { id: identifiers.parse(id) },
      include: { releases: { orderBy: { createdAt: 'desc' } } },
    });
  }
  @Patch('projects/:id') edit(@Param('id') id: string, @Body() input: unknown) {
    return projects.editProject(identifiers.parse(id), input);
  }
  @Post('projects/:id/apply-job') applyJob(@Param('id') id: string, @Body() input: unknown) {
    const { jobId } = z.object({ jobId: identifiers }).parse(input);
    return projects.applyPrepared(identifiers.parse(id), jobId);
  }
  @Post('projects/:id/verify') async verify(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const p = await db.project.findUniqueOrThrow({ where: { id: identifiers.parse(id) } });
    res.status(202);
    return queueImport({
      provider: 'local',
      targetProjectId: id,
      revision: p.revision,
      operation: 'verify-draft',
    });
  }
  @Post('projects/:id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 536870912, files: 1 } }))
  addFile(
    @Param('id') id: string,
    @Body() input: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const value = requiredFile(file);
    const { revision, path } = z
      .object({ revision: z.coerce.number().int().positive(), path: pathSchema })
      .parse(input);
    return projects.addLocalFile(identifiers.parse(id), revision, path, value.buffer);
  }
  @Post('projects/:id/icon')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2097152, files: 1 } }))
  async icon(
    @Param('id') id: string,
    @Body() input: unknown,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const value = requiredFile(file);
    const { revision } = z.object({ revision: z.coerce.number().int().positive() }).parse(input);
    if (value.buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
      throw new BadRequestException('Logo deve ser PNG, até 2 MB');
    const digest = createHash('sha256').update(value.buffer).digest('hex');
    await putObject(`icons/${digest}`, value.buffer, 'image/png');
    return projects.editProject(identifiers.parse(id), {
      revision,
      icon: `/api/v1/public/icons/${digest}`,
    });
  }
  @Get('projects/:id/export') async export(@Param('id') id: string, @Res() res: Response) {
    const project = await db.project.findUniqueOrThrow({ where: { id: identifiers.parse(id) } });
    const bundle = bundleSchema.parse(project.draft);
    res.setHeader('Content-Disposition', `attachment; filename="${project.slug}.modpack.json"`);
    res.json({
      ...bundle,
      files: bundle.files.map((f) => ({ ...f, storageKey: null, status: 'pending' })),
    });
  }
  @Get('projects/:id/upstream') upstream(@Param('id') id: string) {
    return projects.checkUpstream(identifiers.parse(id));
  }
  @Post('projects/:id/upstream/prepare') async prepareUpstream(
    @Param('id') id: string,
    @Body() input: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { versionId } = z.object({ versionId: identifiers }).parse(input);
    res.status(202);
    return projects.prepareUpstream(identifiers.parse(id), versionId);
  }
  @Get('projects/:id/upstream/diff/:jobId') diff(
    @Param('id') id: string,
    @Param('jobId') jobId: string,
  ) {
    return projects.upstreamDiff(identifiers.parse(id), identifiers.parse(jobId));
  }
  @Post('projects/:id/upstream/apply') applyUpstream(
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return projects.applyUpstream(identifiers.parse(id), input);
  }
  @Post('projects/:id/releases') publish(@Param('id') id: string, @Body() input: unknown) {
    return projects.publishProject(identifiers.parse(id), input);
  }
  @Post('launcher/builds') async build(@Res({ passthrough: true }) res: Response) {
    res.status(202);
    return queueLauncherBuild();
  }
  @Get('launcher/builds') launcherBuilds() {
    return db.build.findMany({ orderBy: { versionCode: 'desc' }, take: 20 });
  }
  @Get('diagnostics') diagnostics(@Query() query: unknown) {
    return listDiagnostics(query);
  }
  @Patch('diagnostics/:id') updateDiagnostic(@Param('id') id: string, @Body() input: unknown) {
    return updateDiagnostic(identifiers.parse(id), input);
  }
  @Get('builds/:id/download') async apk(@Param('id') id: string) {
    const build = await db.build.findUniqueOrThrow({ where: { id: identifiers.parse(id) } });
    if (!build.storageKey) throw new BadRequestException('APK ainda não está pronto');
    return { url: await objectUrl(build.storageKey, `pojav-studio-${build.versionCode}.apk`) };
  }
  @Get('public/catalog') publicCatalog(@Query() query: unknown) {
    return publicCatalog(query);
  }
  @Get('public/launcher/download') async launcherDownload(@Res() res: Response) {
    const build = await db.build.findFirst({
      where: { status: 'ready', storageKey: { not: null } },
      orderBy: { versionCode: 'desc' },
    });
    if (!build?.storageKey) throw new BadRequestException('Nenhum launcher disponível ainda');
    res.redirect(await objectUrl(build.storageKey, `pojav-studio-${build.versionCode}.apk`));
  }
  @Get('public/launcher/version') async launcherVersion() {
    const build = await db.build.findFirst({
      where: { status: 'ready', storageKey: { not: null }, sha256: { not: null } },
      orderBy: { versionCode: 'desc' },
    });
    if (!build?.storageKey || !build.sha256)
      throw new BadRequestException('Nenhum launcher disponível ainda');
    return {
      versionCode: build.versionCode,
      minimumVersionCode: build.versionCode,
      versionName: `1.0.${build.versionCode}`,
      sha256: build.sha256,
      url: await objectUrl(build.storageKey),
      downloadHost: new URL(env.PUBLIC_STORAGE_ENDPOINT ?? env.STORAGE_ENDPOINT).hostname,
    };
  }
  @Post('public/diagnostics') submitDiagnostic(@Body() input: unknown) {
    return submitDiagnostic(input);
  }
  @Get('public/projects/:id/latest') async latest(@Param('id') id: string) {
    const release = await db.release.findFirstOrThrow({
      where: { projectId: identifiers.parse(id) },
      orderBy: { createdAt: 'desc' },
    });
    return release.manifest;
  }
  @Get('public/releases/:id/manifest') async manifest(@Param('id') id: string) {
    const release = await db.release.findUniqueOrThrow({ where: { id: identifiers.parse(id) } });
    return release.manifest;
  }
  @Get('public/releases/:id/files/:fileId/download') download(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return projects.releaseDownload(
      identifiers.parse(id),
      z.string().min(1).max(512).parse(fileId),
    );
  }
  @Post('public/releases/:id/downloads') downloads(
    @Param('id') id: string,
    @Body() input: unknown,
  ) {
    return projects.releaseDownloads(identifiers.parse(id), input);
  }
  @Get('public/icons/:hash') async publicIcon(@Param('hash') hash: string, @Res() res: Response) {
    const digest = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(hash);
    res.redirect(await objectUrl(`icons/${digest}`));
  }
}
