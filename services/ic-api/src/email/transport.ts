import { createTransport, type Transporter } from 'nodemailer';

export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

/**
 * Build the SMTP transport from env (§9.3). When SMTP_HOST is unset (local dev /
 * tests) a jsonTransport is returned: sendMail resolves without contacting any
 * server, so flows work end-to-end without a mail server. Production uses
 * authenticated SMTP (Hostinger) for noreply@/admin@/security@.
 */
export function createEmailTransport(): Transporter {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) {
    return createTransport({ jsonTransport: true });
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER?.trim();
  return createTransport({
    host,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS on 587
    ...(user ? { auth: { user, pass: process.env.SMTP_PASSWORD ?? '' } } : {}),
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}
