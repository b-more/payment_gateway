import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './api/api-error.filter';

async function bootstrap(): Promise<void> {
  // rawBody is captured so the HMAC guard can verify the signature over the exact
  // bytes the client signed (SEC-API2).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // KYC documents arrive base64-encoded inside the onboarding JSON body, so the
  // parser limit is raised well above the default 100kb (rawBody is preserved).
  app.useBodyParser('json', { limit: '20mb' });

  // Portals are separate origins; allow them to send session cookies (SEC-A3/A4).
  const origins = (process.env.CORS_ORIGINS ?? '').trim();
  app.enableCors({ origin: origins === '' ? true : origins.split(','), credentials: true });

  // The §8 surface lives under /v1; the healthcheck and the public onboarding
  // application sit outside the versioned prefix.
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'onboarding/applications', method: RequestMethod.POST },
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiErrorFilter());

  const openApi = new DocumentBuilder()
    .setTitle('Instacompay Gateway API')
    .setDescription('v1 payment API. Auth: api_key + HMAC request signature (SEC-API2/3).')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApi));

  const port = Number(process.env.PORT ?? 8030);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
