import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SendMailOptions, Transporter } from 'nodemailer';
import { EMAIL_TRANSPORT, isEmailConfigured } from './transport';
import { applicationReceivedEmail, otpEmail, passwordResetEmail, welcomeEmail } from './templates';

export interface WelcomeEmail {
  to: string;
  merchantName: string;
  accountId: string;
  sandboxApiKey: string; // public api_key only — never a secret (ONB-5)
}

/**
 * Transactional email (§9.3). OTP mails carry only the code (SEC-A1); welcome
 * mails carry the public api_key, never secrets. Sends are best-effort: a mail
 * failure is logged, never thrown, so it can't break login/onboarding.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  // Branded sender so the inbox shows "Instacom Payment Solutions", not a bare
  // mailbox address. Display name is overridable via SMTP_FROM_NAME.
  private readonly from = (() => {
    const address = process.env.SMTP_FROM ?? 'noreply@instacompayzm.com';
    const name = process.env.SMTP_FROM_NAME ?? 'Instacom Payment Solutions';
    return name ? `${name} <${address}>` : address;
  })();

  constructor(@Inject(EMAIL_TRANSPORT) private readonly transport: Transporter) {}

  /** OTP email (SEC-A1). The code is never logged. */
  async sendOtp(otp: { to: string; code: string }): Promise<void> {
    const mail = otpEmail(otp.code);
    await this.send({ to: otp.to, subject: mail.subject, text: mail.text, html: mail.html });
    this.logger.debug(`OTP email dispatched to ${otp.to}`);
  }

  /** Onboarding application acknowledgement (ONB-1) — sent on application submit. */
  async sendApplicationReceived(input: { to: string | string[]; merchantName: string }): Promise<void> {
    const mail = applicationReceivedEmail(input.merchantName);
    await this.send({ to: input.to, subject: mail.subject, text: mail.text, html: mail.html });
    this.logger.debug(`Application-received email dispatched to ${String(input.to)}`);
  }

  /** Password reset code email (SEC-A1). The code is never logged. */
  async sendPasswordReset(reset: { to: string; code: string }): Promise<void> {
    const mail = passwordResetEmail(reset.code);
    await this.send({ to: reset.to, subject: mail.subject, text: mail.text, html: mail.html });
    this.logger.debug(`Password reset email dispatched to ${reset.to}`);
  }

  /** Welcome email (ONB-7). Includes the public sandbox api_key only. */
  async sendWelcome(email: WelcomeEmail): Promise<void> {
    const mail = welcomeEmail({
      merchantName: email.merchantName,
      accountId: email.accountId,
      sandboxApiKey: email.sandboxApiKey,
    });
    await this.send({ to: email.to, subject: mail.subject, text: mail.text, html: mail.html });
    this.logger.debug(`Welcome email dispatched to ${email.to}`);
  }

  private async send(message: Omit<SendMailOptions, 'from'>): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`email send to ${String(message.to)} failed: ${reason}`);
    }
  }

  configured(): boolean {
    return isEmailConfigured();
  }
}
