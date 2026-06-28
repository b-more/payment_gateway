// Branded transactional email templates (§9.3).
//
// Email-safe HTML only: layout tables + inline styles, web-safe fonts, no
// flexbox/grid, and a solid background-color fallback under every gradient
// (Outlook drops gradients). The instac•m wordmark is rendered as live text —
// not an image — so the branding survives even when a client blocks remote
// images. Every template also carries a plain-text part for non-HTML clients.

const BRAND = '#1144bb'; // cobalt — sampled from the instac•m mark
const BRAND_DEEP = '#0a2275';
const ACCENT = '#1e5fe0';
const RED = '#e11d2a'; // the signature dot in instac•m
const INK = '#14213a';
const MUTED = '#5b6b85';
const SOFT = '#3c485f';
const LINE = '#e3eaf4';
const PAGE_BG = '#eef3f8';
const CODE_BG = '#f4f8ff';
const CODE_LINE = '#d7e3fb';

const MERCHANT_PORTAL_URL = process.env.MERCHANT_PORTAL_URL ?? 'https://merchants.instacompayzm.com';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const wordmark = `instac<span style="color:${RED};">&bull;</span>m`;

function layout(opts: { preheader: string; heading: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>Instacom Payment Solutions</title>
</head>
<body style="margin:0; padding:0; background:${PAGE_BG};">
  <span style="display:none !important; visibility:hidden; max-height:0; overflow:hidden; opacity:0; color:transparent;">${opts.preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:100%; font-family:Arial, Helvetica, sans-serif;">

        <!-- header -->
        <tr><td style="background-color:${BRAND}; background-image:linear-gradient(135deg, ${ACCENT} 0%, ${BRAND} 55%, ${BRAND_DEEP} 100%); border-radius:16px 16px 0 0; padding:26px 34px;">
          <div style="font-size:27px; font-weight:800; letter-spacing:-0.5px; color:#ffffff; line-height:1;">${wordmark}</div>
          <div style="font-size:10px; font-weight:700; letter-spacing:3px; color:#cdddff; text-transform:uppercase; margin-top:6px;">Payment Solutions Limited</div>
        </td></tr>

        <!-- body -->
        <tr><td style="background:#ffffff; padding:36px 34px 26px;">
          <h1 style="margin:0 0 14px; font-size:21px; line-height:1.25; color:${INK}; font-weight:800;">${opts.heading}</h1>
          ${opts.bodyHtml}
        </td></tr>

        <!-- footer -->
        <tr><td style="background:#ffffff; border-top:1px solid ${LINE}; border-radius:0 0 16px 16px; padding:22px 34px 26px;">
          <div style="font-size:12px; color:${MUTED}; line-height:1.7;">
            <strong style="color:${INK};">Instacom Payment Solutions Limited</strong><br>
            Lusaka, Zambia &middot; Settled in Zambian Kwacha (ZMW) &middot; Bank of Zambia licensed
          </div>
          <div style="font-size:11px; color:#9aa7bd; margin-top:10px;">This is an automated message — please do not reply.</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 18px; font-size:15px; color:${SOFT}; line-height:1.6;">${text}</p>`;
}

function codeBox(value: string, opts?: { spaced?: boolean }): string {
  const spacing = opts?.spaced ? 'letter-spacing:8px;' : 'letter-spacing:1px;';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:6px 0 22px;">
    <div style="display:inline-block; background:${CODE_BG}; border:1px solid ${CODE_LINE}; border-radius:12px; padding:16px 26px; font-family:'Courier New', Courier, monospace; font-size:30px; font-weight:700; ${spacing} color:${BRAND};">${value}</div>
  </td></tr></table>`;
}

function note(text: string): string {
  return `<p style="margin:4px 0 0; font-size:13px; color:${MUTED}; line-height:1.6;">${text}</p>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr>
    <td style="background-color:${BRAND}; background-image:linear-gradient(135deg, ${ACCENT}, ${BRAND_DEEP}); border-radius:10px;">
      <a href="${href}" style="display:inline-block; padding:13px 26px; font-family:Arial, Helvetica, sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none;">${label}</a>
    </td></tr></table>`;
}

/** OTP sign-in code (SEC-A1). */
export function otpEmail(code: string): RenderedEmail {
  return {
    subject: 'Your Instacom verification code',
    text:
      `Your Instacom verification code is ${code}.\n\n` +
      `It expires in 5 minutes and can be used once. ` +
      `If you didn't try to sign in, you can ignore this email.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: `Your verification code is ${code} — expires in 5 minutes.`,
      heading: 'Verify your sign-in',
      bodyHtml:
        paragraph('Use this one-time code to finish signing in to your Instacom account:') +
        codeBox(code, { spaced: true }) +
        note('This code expires in <strong>5 minutes</strong> and can be used once. If you didn’t try to sign in, you can safely ignore this email.'),
    }),
  };
}

/** Password reset code (SEC-A1). */
export function passwordResetEmail(code: string): RenderedEmail {
  return {
    subject: 'Reset your Instacom password',
    text:
      `Your Instacom password reset code is ${code}.\n\n` +
      `Enter it in the portal to set a new password. It expires in 15 minutes and can be used once. ` +
      `If you didn't request a reset, you can ignore this email — your password is unchanged.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: `Your password reset code is ${code} — expires in 15 minutes.`,
      heading: 'Reset your password',
      bodyHtml:
        paragraph('Enter this code in the portal to set a new password:') +
        codeBox(code, { spaced: true }) +
        note('This code expires in <strong>15 minutes</strong> and can be used once. If you didn’t request a reset, ignore this email — your password stays unchanged.'),
    }),
  };
}

export interface WelcomeEmailInput {
  merchantName: string;
  accountId: string;
  sandboxApiKey: string;
}

/** Onboarding welcome (ONB-7). Carries the public api_key only — never a secret. */
export function welcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  return {
    subject: 'Welcome to Instacom',
    text:
      `Welcome, ${input.merchantName}.\n\n` +
      `Your account ${input.accountId} is ready. ` +
      `Sandbox API key: ${input.sandboxApiKey}.\n\n` +
      `Sign in to the merchant portal to view your dashboard: ${MERCHANT_PORTAL_URL}\n` +
      `Your secret and signing keys are shown once in the portal — store them securely.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: `Your Instacom account ${input.accountId} is ready.`,
      heading: `Welcome, ${input.merchantName}.`,
      bodyHtml:
        paragraph(`Your account <strong style="color:${INK};">${input.accountId}</strong> is ready. Here is your sandbox API key to start integrating:`) +
        codeBox(input.sandboxApiKey) +
        button(`${MERCHANT_PORTAL_URL}/dashboard`, 'Open your dashboard') +
        note('Your secret and signing keys are shown <strong>once</strong> in the portal — store them somewhere safe. Collect, disburse and settle across MTN, Airtel, Zamtel, Zed Mobile and Visa, all in Kwacha.'),
    }),
  };
}
