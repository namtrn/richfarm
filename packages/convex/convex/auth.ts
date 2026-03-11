import { createClient } from "@convex-dev/better-auth";
import { convex as convexPlugin } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { anonymous } from "better-auth/plugins";
import { components } from "./_generated/api";
import authConfig from "./auth.config";

export const authComponent = createClient(components.betterAuth);

const trustedOriginsFromEnv = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin: string) => origin.trim())
  .filter(Boolean);

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const authEmailFrom = process.env.AUTH_EMAIL_FROM?.trim();
const authEmailAppName = process.env.AUTH_EMAIL_APP_NAME?.trim() || "Richfarm";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sendAuthEmail(args: {
  to: string;
  subject: string;
  heading: string;
  body: string;
  ctaLabel: string;
  url: string;
}) {
  if (!resendApiKey || !authEmailFrom) {
    console.warn("[auth] Email sending is not configured. Set RESEND_API_KEY and AUTH_EMAIL_FROM.");
    console.info(`[auth] ${args.subject} link for ${args.to}: ${args.url}`);
    return;
  }

  const escapedHeading = escapeHtml(args.heading);
  const escapedBody = escapeHtml(args.body);
  const escapedLabel = escapeHtml(args.ctaLabel);
  const escapedUrl = escapeHtml(args.url);

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#172554;">
      <p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin:0 0 16px;">
        ${escapeHtml(authEmailAppName)}
      </p>
      <h1 style="font-size:24px;line-height:1.3;margin:0 0 12px;">${escapedHeading}</h1>
      <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 24px;">${escapedBody}</p>
      <a
        href="${escapedUrl}"
        style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;"
      >
        ${escapedLabel}
      </a>
      <p style="font-size:12px;line-height:1.6;color:#64748b;margin:24px 0 0;">
        If the button does not open, copy and paste this link into your browser:<br />
        <a href="${escapedUrl}" style="color:#15803d;">${escapedUrl}</a>
      </p>
    </div>
  `;

  const text = `${args.heading}\n\n${args.body}\n\n${args.ctaLabel}: ${args.url}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: authEmailFrom,
      to: [args.to],
      subject: args.subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email request failed (${response.status}): ${body}`);
  }
}

export const createAuth = (ctx: Parameters<typeof authComponent.adapter>[0]) =>
  betterAuth({
    database: authComponent.adapter(ctx),
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [...trustedOriginsFromEnv, "my-garden://"],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      async sendVerificationEmail({ user, url }) {
        await sendAuthEmail({
          to: user.email,
          subject: `Verify your ${authEmailAppName} email`,
          heading: "Verify your email address",
          body: `Finish creating your ${authEmailAppName} account by confirming this email address.`,
          ctaLabel: "Verify email",
          url,
        });
      },
    },
    // Bật deleteUser API — cần thiết cho deleteAccount mutation
    // auth.api.deleteUser({ headers, body: {} }) sẽ throw nếu không bật
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    plugins: [expo(), anonymous(), convexPlugin({ authConfig })],
  });
