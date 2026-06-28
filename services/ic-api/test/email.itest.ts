import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SMTPServer } from 'smtp-server';
import type { AddressInfo } from 'node:net';

// Captured mail
interface Captured {
  from: string;
  to: string[];
  raw: string;
}
const received: Captured[] = [];
let server: SMTPServer;

before(async () => {
  server = new SMTPServer({
    authOptional: true,
    hideSTARTTLS: true, // plain SMTP for the test sink (no self-signed cert dance)
    onData(stream, session, callback) {
      let data = '';
      stream.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: data,
        });
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.server.address() as AddressInfo).port;

  // Point the transport at the local sink BEFORE constructing it.
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_FROM = 'noreply@instacompayzm.com';
  delete process.env.SMTP_USER;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('§9.3/SEC-A1: OTP email is sent via SMTP with the code and correct headers', async () => {
  received.length = 0;
  const { EmailService } = await import('../src/email/email.service');
  const { createEmailTransport } = await import('../src/email/transport');
  const email = new EmailService(createEmailTransport());

  await email.sendOtp({ to: 'merchant@example.zm', code: '482915' });

  assert.equal(received.length, 1);
  const msg = received[0];
  assert.equal(msg.from, 'noreply@instacompayzm.com');
  assert.deepEqual(msg.to, ['merchant@example.zm']);
  assert.match(msg.raw, /Subject: Your Instacompay verification code/);
  assert.match(msg.raw, /482915/); // the code is present
  assert.ok(!/password/i.test(msg.raw)); // no other sensitive data
});

test('§9.3/ONB-7: welcome email carries the public api_key, no secret', async () => {
  received.length = 0;
  const { EmailService } = await import('../src/email/email.service');
  const { createEmailTransport } = await import('../src/email/transport');
  const email = new EmailService(createEmailTransport());

  await email.sendWelcome({
    to: 'owner@example.zm',
    merchantName: 'Acme',
    accountId: 'acc-123',
    sandboxApiKey: 'ic_sand_abc123',
  });

  assert.equal(received.length, 1);
  assert.match(received[0].raw, /Welcome to Instacompay/);
  assert.match(received[0].raw, /ic_sand_abc123/);
});

test('dev fallback: with no SMTP_HOST, sending is a no-op that does not throw', async () => {
  const savedHost = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  try {
    received.length = 0;
    const { EmailService } = await import('../src/email/email.service');
    const { createEmailTransport } = await import('../src/email/transport');
    const email = new EmailService(createEmailTransport());
    await email.sendOtp({ to: 'x@example.zm', code: '000000' });
    assert.equal(received.length, 0); // nothing hit the SMTP sink
  } finally {
    process.env.SMTP_HOST = savedHost;
  }
});
