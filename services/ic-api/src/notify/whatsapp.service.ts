import { Injectable } from '@nestjs/common';

/**
 * WhatsApp Business Platform sender (Meta Cloud API). Business-initiated messages
 * must use a pre-approved template, so this sends a template with body params.
 * Inert until WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set — never baked in.
 *
 * Env: WHATSAPP_TOKEN (permanent access token), WHATSAPP_PHONE_ID (Phone Number
 * ID), WHATSAPP_TEMPLATE (default 'daily_summary'), WHATSAPP_TEMPLATE_LANG
 * (default 'en'), WHATSAPP_API_VERSION (default 'v21.0').
 */
@Injectable()
export class WhatsAppService {
  private readonly token = (process.env.WHATSAPP_TOKEN ?? '').trim();
  private readonly phoneId = (process.env.WHATSAPP_PHONE_ID ?? '').trim();
  private readonly template = (process.env.WHATSAPP_TEMPLATE ?? 'daily_summary').trim();
  private readonly lang = (process.env.WHATSAPP_TEMPLATE_LANG ?? 'en').trim();
  private readonly version = (process.env.WHATSAPP_API_VERSION ?? 'v21.0').trim();

  get isConfigured(): boolean {
    return this.token.length > 0 && this.phoneId.length > 0;
  }

  /** Send the configured template to one recipient with ordered body params. */
  async sendTemplate(toPhone: string, params: string[]): Promise<void> {
    if (!this.isConfigured) throw new Error('WhatsApp is not configured');
    const to = toPhone.replace(/[^\d]/g, ''); // E.164 digits, e.g. 260975020473
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: this.template,
        language: { code: this.lang },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    };
    const res = await fetch(`https://graph.facebook.com/${this.version}/${this.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) throw new Error(`WhatsApp send failed: ${j.error?.message ?? `HTTP ${res.status}`}`);
  }
}
