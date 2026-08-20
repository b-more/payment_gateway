import { Injectable } from '@nestjs/common';
import { SmsService } from '../sms/sms.service';
import { WhatsAppService } from './whatsapp.service';

export interface OwnerAlert {
  phone: string;
  smsText: string;    // ready-to-send plain text (SMS)
  waParams: string[]; // ordered template body params (WhatsApp)
}

/**
 * One place that decides HOW an owner alert is delivered. Channel is chosen by
 * OWNER_ALERT_CHANNEL ('sms' | 'whatsapp', default 'sms'); WhatsApp is used only
 * when selected AND configured, otherwise it falls back to SMS. The daily-summary
 * engine is channel-agnostic — it just hands over both renderings.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly sms: SmsService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  private get channel(): string {
    return (process.env.OWNER_ALERT_CHANNEL ?? 'sms').toLowerCase();
  }

  async sendOwnerAlert(alert: OwnerAlert): Promise<'whatsapp' | 'sms'> {
    if (this.channel === 'whatsapp' && this.whatsapp.isConfigured) {
      await this.whatsapp.sendTemplate(alert.phone, alert.waParams);
      return 'whatsapp';
    }
    await this.sms.send(alert.phone, alert.smsText);
    return 'sms';
  }
}
