import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const authEmailFrom = process.env.AUTH_EMAIL_FROM;
const appName = process.env.AUTH_EMAIL_APP_NAME ?? "Richfarm";

let resendClient: Resend | null = null;

function getResendClient() {
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  resendClient ??= new Resend(resendApiKey);
  return resendClient;
}

function getEmailFrom() {
  if (!authEmailFrom) {
    throw new Error("AUTH_EMAIL_FROM is not set");
  }
  return authEmailFrom;
}

async function sendAuthEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const { error } = await getResendClient().emails.send({
    from: getEmailFrom(),
    to,
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(error.message || "Failed to send auth email");
  }
}

export async function sendVerificationEmailMessage(args: {
  email: string;
  name?: string | null;
  url: string;
}) {
  const greeting = args.name?.trim() ? args.name.trim() : "there";
  await sendAuthEmail({
    to: args.email,
    subject: `Verify your ${appName} account`,
    text: `Hi ${greeting},\n\nVerify your email for ${appName} by opening this link:\n${args.url}\n\nIf you did not create this account, you can ignore this email.`,
    html: `<p>Hi ${greeting},</p><p>Verify your email for <strong>${appName}</strong> by opening the link below.</p><p><a href="${args.url}">Verify email</a></p><p>If you did not create this account, you can ignore this email.</p>`,
  });
}

export async function sendPasswordResetEmail(args: {
  email: string;
  name?: string | null;
  url: string;
}) {
  const greeting = args.name?.trim() ? args.name.trim() : "there";
  await sendAuthEmail({
    to: args.email,
    subject: `Reset your ${appName} password`,
    text: `Hi ${greeting},\n\nReset your ${appName} password by opening this link:\n${args.url}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Hi ${greeting},</p><p>Reset your <strong>${appName}</strong> password by opening the link below.</p><p><a href="${args.url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}
