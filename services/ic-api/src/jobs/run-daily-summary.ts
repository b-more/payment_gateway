import { createPool } from '../database/database.module';
import { SmsService } from '../sms/sms.service';
import { WhatsAppService } from '../notify/whatsapp.service';
import { MessagingService } from '../notify/messaging.service';
import { DailySummaryService } from '../notify/daily-summary.service';

// Owner daily-summary alert. One message per merchant with today's takings,
// delivered by MessagingService (SMS now; WhatsApp when configured).
//
// Run via cron / the compose `tools` profile — never on app boot. Guarded by
// OWNER_ALERTS_ENABLED=true so it never fires by accident. For a safe end-to-end
// test, pass `--test <phone>` (sends every summary to that number instead of the
// merchants', and ignores the enabled gate). `--offset N` summarises N days ago.
function arg(name: string): string | null {
  const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return null;
  const a = process.argv[i];
  if (a.includes('=')) return a.split('=').slice(1).join('=');
  return process.argv[i + 1] ?? '';
}

async function main(): Promise<void> {
  const testPhone = arg('test');
  const offset = Number(arg('offset') ?? process.env.DAILY_SUMMARY_DAY_OFFSET ?? '0');

  const sms = new SmsService();
  const whatsapp = new WhatsAppService();
  if (!sms.isConfigured && !whatsapp.isConfigured) {
    process.stdout.write('daily-summary: no SMS/WhatsApp channel configured — skipping\n');
    return;
  }
  if (!testPhone && process.env.OWNER_ALERTS_ENABLED !== 'true') {
    process.stdout.write('daily-summary: OWNER_ALERTS_ENABLED not true — skipping (use --test <phone> to try it)\n');
    return;
  }

  const pool = createPool();
  const svc = new DailySummaryService(pool, new MessagingService(sms, whatsapp));
  try {
    const r = await svc.run(offset, testPhone);
    process.stdout.write(
      `daily-summary (${r.window}): merchants=${r.merchants} sms=${r.sentSms} whatsapp=${r.sentWhatsapp} ` +
        `no_phone=${r.skippedNoPhone} failed=${r.failed}${testPhone ? ` [TEST → ${testPhone}]` : ''}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`daily-summary failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
