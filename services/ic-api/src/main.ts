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
    .setVersion('1.0')
    .addServer('https://api.instacompayzm.com')
    .setDescription(
      [
        'Collections and disbursements over Zambian mobile money (ZMW).',
        '',
        '## Authentication',
        'Every request is individually signed — there are no session tokens. Send three headers:',
        '',
        '| Header | Value |',
        '| --- | --- |',
        '| `X-Api-Key` | Your key, `ic_live_…` (or `ic_sand_…` for sandbox). |',
        '| `X-Timestamp` | Unix epoch **seconds**. Must be within ±5 minutes of server time. |',
        '| `X-Signature` | `HMAC-SHA256(signingKey, message)` as hex, where <br>`message = "{timestamp}.{METHOD}.{path}.{rawBody}"`. |',
        '',
        'Mutating calls (`POST`) also require an `Idempotency-Key` header (any unique string; replays return the original result).',
        '',
        '```js',
        "const ts = Math.floor(Date.now()/1000).toString();",
        "const message = `${ts}.POST./v1/collections.${body}`;",
        "const signature = crypto.createHmac('sha256', SIGNING_KEY).update(message).digest('hex');",
        '```',
        '',
        '## Money',
        'All amounts are **integer ngwee, as strings** — K1.50 = `"150"`, K50.00 = `"5000"`. Never decimals or JSON numbers.',
        '',
        '## Status',
        'Poll `GET /v1/transactions/{id}` to check the status of **any** transaction — collection or disbursement.',
        'Statuses: `PROCESSING` → `SUCCESS` | `FAILED`. Start on **sandbox** (`ic_sand_…`) before going live.',
      ].join('\n'),
    )
    .build();

  const doc = SwaggerModule.createDocument(app, openApi);

  // Focused integration reference: expose only the core payment operations, not
  // the full internal surface (auth/onboarding/admin/portal/callbacks).
  const KEEP: Record<string, string[]> = {
    '/v1/collections': ['post'],
    '/v1/transactions/{id}': ['get'],
    '/v1/disbursements': ['post'],
  };
  const paths: typeof doc.paths = {};
  for (const [path, methods] of Object.entries(KEEP)) {
    const item = doc.paths[path] as Record<string, unknown> | undefined;
    if (!item) continue;
    const kept: Record<string, unknown> = {};
    for (const method of methods) if (item[method]) kept[method] = item[method];
    paths[path] = kept as (typeof doc.paths)[string];
  }
  doc.paths = paths;
  const KEEP_TAGS = new Set(['collections', 'disbursements', 'transactions']);
  if (doc.tags) doc.tags = doc.tags.filter((t) => KEEP_TAGS.has(t.name));

  SwaggerModule.setup('docs', app, doc);

  const port = Number(process.env.PORT ?? 8030);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
