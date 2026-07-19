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
        '**Simple (recommended)** — send your key and secret on every call. No signing, no timestamps.',
        '',
        '| Header | Value |',
        '| --- | --- |',
        '| `X-Api-Key` | Your key, `ic_live_…` (or `ic_sand_…` for sandbox). |',
        '| `X-Api-Secret` | Your secret, `sk_…`. Or send `Authorization: Bearer <secret>` instead. |',
        '',
        '**Signed (hardened, optional)** — sign the request instead of sending the secret. Adds replay protection and body integrity. Send `X-Signature` and signed mode is used automatically.',
        '',
        '| Header | Value |',
        '| --- | --- |',
        '| `X-Timestamp` | Unix epoch **seconds**. Must be within ±5 minutes of server time. |',
        '| `X-Signature` | `HMAC-SHA256(signingKey, message)` as hex, where <br>`message = "{timestamp}.{METHOD}.{path}.{rawBody}"`. |',
        '',
        'Mutating calls (`POST`) also require an `Idempotency-Key` header (any unique string; re-send the same one to safely retry).',
        '',
        '## Money',
        'All amounts are **integer ngwee, as strings** — K1.50 = `"150"`, K50.00 = `"5000"`. Never decimals or JSON numbers.',
        '',
        '## Status',
        'Poll `GET /v1/transactions/{id}` to check the status of **any** transaction — collection or disbursement.',
        'Statuses: `PROCESSING` → `SUCCESS` | `FAILED`.',
        '',
        '## Refunding a customer',
        'There is no reverse/void call. To refund someone, send them a **disbursement** for what they actually paid — that is a real transfer back to their wallet, with its own id and status you can poll.',
        '',
        '```',
        'POST /v1/disbursements',
        '{ "processor": "AIRTEL", "amount": "103", "msisdn": "260970000001",',
        '  "collectionReference": "refund-of-order-1001" }',
        '```',
        '',
        'Note the amount: if the customer covered the fee, they paid `amount + charge` (K1.00 + K0.03 = `"103"`), not just the `net_amount` you received. Use `collectionReference` to tie the refund back to the original order for reconciliation.',
        '',
        '## Webhooks',
        'In production a collection returns `PROCESSING` and resolves later, so we POST the outcome to your callback URL (set it in the Merchant Portal → API Documentation).',
        '',
        '```',
        'POST <your callback url>',
        'X-Instacompay-Event: transaction.success',
        'X-Instacompay-Signature: t=1752380000,v1=<hex>',
        '',
        '{ "id": "<event id>", "type": "transaction.success",',
        '  "created_at": "…", "data": { "id": "<transaction id>", "status": "SUCCESS", … } }',
        '```',
        '',
        '**Verify every webhook** — reject any request whose signature does not match:',
        '',
        '```js',
        "const [t, v1] = header.split(',').map((p) => p.split('=')[1]);",
        "const expected = crypto.createHmac('sha256', WEBHOOK_SECRET)",
        '  .update(`${t}.${rawBody}`).digest(\'hex\');   // rawBody = the exact bytes received',
        'if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) reject();',
        '```',
        '',
        'Get `WEBHOOK_SECRET` (`whsec_…`) from the Merchant Portal, or `GET /v1/merchant/accounts/{id}/webhook-secret`. Respond `2xx` to acknowledge; we retry with backoff otherwise.',
        '',
        '## Sandbox',
        'Start with a sandbox key (`ic_sand_…`). Sandbox **simulates and settles instantly** — no real money and no float used — so you can exercise the full `PROCESSING → SUCCESS` lifecycle before going live.',
        'Sandbox accepts only the rails that are actually live in production, so anything that works here will work when you switch keys.',
      ].join('\n'),
    )
    .build();

  const doc = SwaggerModule.createDocument(app, openApi);

  // Focused integration reference: expose only the core payment operations, not
  // the full internal surface (auth/onboarding/admin/portal/callbacks).
  // Must stay in step with the Postman collection and the published guides —
  // an integrator comparing them should never see a different set.
  const KEEP: Record<string, string[]> = {
    '/v1/collections': ['post'],
    '/v1/disbursements': ['post'],
    '/v1/transactions/{id}': ['get'],
    '/v1/accounts/{id}/balance': ['get'],
    '/v1/settlements': ['get'],
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
