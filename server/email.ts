import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Ceylon 1802 <noreply@ceylon1802.com>';
const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;

let transporter: nodemailer.Transporter | null = null;

if (SMTP_HOST && SMTP_USER) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendInviteEmail(email: string, token: string, inviterName: string): Promise<boolean> {
  const link = `${BASE_URL}/invite/${token}`;

  if (!transporter) {
    console.log(`[email] No SMTP configured. Invite link for ${email}: ${link}`);
    return true;
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: email,
      subject: `${inviterName} invited you to Ceylon 1802`,
      text: `${inviterName} has invited you to play Ceylon 1802 — a text adventure in the age of spice.\n\nClick this link to create your account:\n${link}\n\nThis invite is for ${email} only.`,
      html: `<p><strong>${inviterName}</strong> has invited you to play <strong>Ceylon 1802</strong> — a text adventure in the age of spice.</p><p><a href="${link}">Click here to create your account</a></p><p style="color:#888;font-size:12px;">This invite is for ${email} only.</p>`,
    });
    console.log(`[email] Invite sent to ${email}`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send invite:', err);
    return false;
  }
}
