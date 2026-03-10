import { createClient } from "@convex-dev/better-auth";
import { convex as convexPlugin } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { anonymous } from "better-auth/plugins";
import { components } from "./_generated/api";
import authConfig from "./auth.config";
import { mergeAnonymousUserIntoAccount } from "./lib/userAccounts";

export const authComponent = createClient(components.betterAuth);

const trustedOriginsFromEnv = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin: string) => origin.trim())
  .filter(Boolean);

export const createAuth = (ctx: Parameters<typeof authComponent.adapter>[0]) =>
  betterAuth({
    database: authComponent.adapter(ctx),
    secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [...trustedOriginsFromEnv, "my-garden://"],
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      expo(),
      anonymous({
        async onLinkAccount({ anonymousUser, newUser }) {
          await mergeAnonymousUserIntoAccount(ctx, {
            anonymousAuthUserId: anonymousUser.user.id,
            authenticatedAuthUserId: newUser.user.id,
            authenticatedName: newUser.user.name,
            authenticatedEmail: newUser.user.email,
          });
        },
      }),
      convexPlugin({ authConfig }),
    ],
  });
