import { Injectable, Logger } from '@nestjs/common';

/**
 * Ontech BulkSMS HTTP API client (bulksms.ontech.co.zm). Credentials come from
 * the environment (SMS_API_KEY, SMS_SENDER_ID) and are never baked in. Inert
 * when unconfigured — callers should check `isConfigured` or handle the throw.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger('SmsService');
  private readonly apiKey = (process.env.SMS_API_KEY ?? '').trim();
  private readonly senderId = (process.env.SMS_SENDER_ID ?? '').trim();
  private readonly baseUrl = (process.env.SMS_BASE_URL ?? 'https://bulksms.ontech.co.zm/smsservice/httpapi').trim();
  private readonly timeoutMs = Number(process.env.SMS_TIMEOUT_MS ?? '30000');

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /** Send one SMS. Throws a descriptive Error on any non-success provider status. */
  async send(phone: string, message: string): Promise<void> {
    if (!this.isConfigured) throw new Error('SMS is not configured');

    const params = new URLSearchParams({ api_key: this.apiKey, phone, msg: message });
    if (this.senderId) params.set('sender_id', this.senderId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let body: { status?: number | string; message?: string } = {};
    try {
      const res = await fetch(`${this.baseUrl}?${params.toString()}`, { method: 'GET', signal: controller.signal });
      body = (await res.json().catch(() => ({}))) as typeof body;
      if (!res.ok) throw new Error(`SMS gateway returned HTTP ${res.status}`);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw new Error('SMS gateway timed out');
      throw e;
    } finally {
      clearTimeout(timer);
    }

    const status = Number(body.status);
    if (status !== 100) {
      const reason =
        status === 101 ? 'insufficient SMS credits'
        : status === 102 ? 'SMS authentication failed'
        : status === 103 ? 'invalid SMS parameters'
        : `SMS provider status ${body.status ?? 'unknown'}`;
      this.logger.warn(`SMS send failed: ${reason}`);
      throw new Error(reason);
    }
  }
}
