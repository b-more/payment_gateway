import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SendMailOptions, Transporter } from 'nodemailer';
import { EMAIL_TRANSPORT, isEmailConfigured } from './transport';

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
  private readonly from = process.env.SMTP_FROM ?? 'noreply@instacompayzm.com';

  constructor(@Inject(EMAIL_TRANSPORT) private readonly transport: Transporter) {}

  /** OTP email (SEC-A1). The code is never logged. */
  async sendOtp(otp: { to: string; code: string }): Promise<void> {
    await this.send({
      to: otp.to,
      subject: 'Your Instacompay verification code',
      text:
        `Your Instacompay verification code is ${otp.code}.\n\n` +
        `It expires in 5 minutes and can be used once. ` +
        `If you didn't try to sign in, you can ignore this email.`,
    });
    this.logger.debug(`OTP email dispatched to ${otp.to}`);
  }

  /** Password reset code email (SEC-A1). The code is never logged. */
  async sendPasswordReset(reset: { to: string; code: string }): Promise<void> {
    await this.send({
      to: reset.to,
      subject: 'Reset your Instacompay password',
      text:
        `Your Instacompay password reset code is ${reset.code}.\n\n` +
        `Enter it in the portal to set a new password. It expires in 15 minutes and can be used once. ` +
        `If you didn't request a reset, you can ignore this email — your password is unchanged.`,
    });
    this.logger.debug(`Password reset email dispatched to ${reset.to}`);
  }

  /** Welcome email (ONB-7). Includes the public sandbox api_key only. */
  async sendWelcome(email: WelcomeEmail): Promise<void> {
    await this.send({
      to: email.to,
      subject: 'Welcome to Instacompay',
      text:
        `Welcome, ${email.merchantName}.\n\n` +
        `Your account ${email.accountId} is ready. ` +
        `Sandbox API key: ${email.sandboxApiKey}.\n\n` +
        `Sign in to the merchant portal to view your dashboard. ` +
        `Your secret and signing keys are shown once in the portal — store them securely.`,
    });
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
