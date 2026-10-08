import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { json as jsonBody, urlencoded, type Response } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ApiController } from './controller.js';
import { AuthGuard } from './auth.js';
import { env } from './config.js';
import { db, closeInfra, ensureBucket } from './infra.js';
import { ProviderError } from './providers/http.js';
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return res.end();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof ZodError
          ? 400
          : error instanceof ProviderError
            ? 502
            : error instanceof Prisma.PrismaClientKnownRequestError
              ? error.code === 'P2025'
                ? 404
                : error.code === 'P2002'
                  ? 409
                  : 500
              : 500;
    const message =
      error instanceof ZodError
        ? error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')
        : status === 500
          ? 'Falha interna ao processar a solicitação'
          : error instanceof Error
            ? error.message
            : 'Requisição inválida';
    if (status === 500) console.error(error);
    res.status(status).json({ statusCode: status, message });
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}
const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log'],
  bodyParser: false,
});
app.getHttpAdapter().getInstance().set('trust proxy', 1);
app.use(helmet());
app.use(jsonBody({ limit: '1mb' }));
app.use(urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
app.useGlobalGuards(new AuthGuard());
app.useGlobalFilters(new Errors());
await db.$connect();
await ensureBucket();
await app.listen(env.PORT, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(
    signal,
    () =>
      void app
        .close()
        .then(closeInfra)
        .then(() => process.exit(0)),
  );
