import { createClient } from "@convex-dev/better-auth";
import { convex as convexPlugin } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { components } from "./_generated/api";
import authConfig from "./auth.config";

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
    plugins: [expo(), convexPlugin({ authConfig })],
  });
