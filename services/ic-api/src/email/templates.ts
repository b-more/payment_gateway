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

/** Onboarding application acknowledgement (ONB-1) — sent the moment a merchant
 *  applies, so the entered email always gets a confirmation. Carries no secrets. */
export function applicationReceivedEmail(merchantName: string): RenderedEmail {
  return {
    subject: 'We’ve received your Instacom application',
    text:
      `Hello ${merchantName},\n\n` +
      `Thanks for applying for an Instacom merchant account. We’ve received your ` +
      `application and our compliance team will review it and get back to you within ` +
      `24–48 hours.\n\n` +
      `There’s nothing you need to do right now — we’ll email you as soon as your ` +
      `account is approved and ready to set up.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: 'We’ve received your merchant application — review takes 24–48 hours.',
      heading: `Thanks, ${merchantName} — we’ve got your application.`,
      bodyHtml:
        paragraph(
          'Your Instacom merchant application has been received. Our compliance team will ' +
            'review your details and KYC documents and get back to you within <strong>24–48 hours</strong>.',
        ) +
        note(
          'There’s nothing you need to do right now — we’ll email you the moment your account ' +
            'is approved and ready to set up.',
        ),
    }),
  };
}

/** Application approved (ONB-3). The welcome mail with credentials follows once
 *  an admin provisions the account. */
export function applicationApprovedEmail(merchantName: string): RenderedEmail {
  return {
    subject: 'Your Instacom application is approved 🎉',
    text:
      `Good news, ${merchantName}!\n\n` +
      `Your Instacom merchant account has been approved. Our team is setting up your ` +
      `account now — you’ll receive a separate email with your dashboard access and ` +
      `sandbox API key shortly.\n\n` +
      `Welcome aboard.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: 'Your Instacom merchant account has been approved.',
      heading: `Good news, ${merchantName} — you’re approved.`,
      bodyHtml:
        paragraph(
          'Your Instacom merchant account has been <strong>approved</strong>. Welcome aboard — ' +
            'you’re one step away from collecting and settling in Kwacha across every Zambian rail.',
        ) +
        note(
          'Our team is finishing your account setup. You’ll receive a separate email with your ' +
            'dashboard access and sandbox API key shortly — no action needed from you right now.',
        ),
    }),
  };
}

/** Application declined (ONB-3). Carries the reviewer’s reason. */
export function applicationRejectedEmail(merchantName: string, reason: string): RenderedEmail {
  return {
    subject: 'Update on your Instacom application',
    text:
      `Hello ${merchantName},\n\n` +
      `Thank you for your interest in Instacom. After reviewing your application, we’re ` +
      `unable to approve your merchant account at this time.\n\n` +
      `Reason: ${reason}\n\n` +
      `If you believe this was a mistake or can provide more information, reply to this ` +
      `email and our team will be glad to help.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: 'An update on your Instacom merchant application.',
      heading: 'Update on your application',
      bodyHtml:
        paragraph(
          `Thank you for your interest in Instacom, ${merchantName}. After reviewing your ` +
            'application, we’re unable to approve your merchant account at this time.',
        ) +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:#fff6f6; border:1px solid #f3d0d3; border-left:4px solid ${RED}; border-radius:8px; padding:14px 16px; margin:0 0 18px;">
          <div style="font-size:11px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${RED}; margin-bottom:4px;">Reason</div>
          <div style="font-size:14px; color:${INK}; line-height:1.55;">${reason}</div>
        </td></tr></table>` +
        note(
          'If you believe this was a mistake or can provide more information, simply reply to ' +
            'this email and our team will be glad to help.',
        ),
    }),
  };
}

export interface PortalCredentialsInput {
  loginEmail: string;
  tempPassword: string;
}

/** Portal login details (§7.1) — issued when a merchant's account is first
 *  provisioned, so the admin user can actually sign in. Sign-in still requires
 *  an emailed OTP, and the user is told to change the temporary password. */
export function portalCredentialsEmail(input: PortalCredentialsInput): RenderedEmail {
  const host = MERCHANT_PORTAL_URL.replace(/^https?:\/\//, '');
  const cell = `padding:12px 16px; border-bottom:1px solid ${LINE};`;
  const label = `${cell} background:${CODE_BG}; font-size:12px; color:${MUTED}; width:150px;`;
  return {
    subject: 'Your Instacom merchant portal login details',
    text:
      `Your Instacom merchant portal access is ready.\n\n` +
      `Portal:   ${MERCHANT_PORTAL_URL}/login\n` +
      `Email:    ${input.loginEmail}\n` +
      `Password: ${input.tempPassword}\n\n` +
      `At sign-in you’ll be asked for a one-time verification code that we email you. ` +
      `For your security, please change this temporary password after your first login.\n\n` +
      `— Instacom Payment Solutions Limited`,
    html: layout({
      preheader: 'Your merchant portal login details are inside.',
      heading: 'Your portal access is ready',
      bodyHtml:
        paragraph('You can now sign in to the Instacom merchant portal with the details below:') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 18px; border:1px solid ${LINE}; border-radius:10px; overflow:hidden;">
          <tr><td style="${label}">Portal</td><td style="${cell}"><a href="${MERCHANT_PORTAL_URL}/login" style="color:${BRAND}; font-weight:700; text-decoration:none;">${host}/login</a></td></tr>
          <tr><td style="${label}">Email</td><td style="${cell} font-family:'Courier New',Courier,monospace; font-size:14px; color:${INK};">${input.loginEmail}</td></tr>
          <tr><td style="${label} border-bottom:none;">Temporary password</td><td style="${cell} border-bottom:none; font-family:'Courier New',Courier,monospace; font-size:15px; font-weight:700; color:${BRAND};">${input.tempPassword}</td></tr>
        </table>` +
        button(`${MERCHANT_PORTAL_URL}/login`, 'Sign in to the portal') +
        note(
          'At sign-in you’ll be asked for a one-time verification code that we email you. ' +
            'For your security, please <strong>change this temporary password</strong> after your first login.',
        ),
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
