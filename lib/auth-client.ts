import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

const baseURL = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
const scheme = "my-garden";

if (!baseURL) {
  throw new Error("EXPO_PUBLIC_CONVEX_SITE_URL is not set");
}

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    convexClient(),
    expoClient({
      scheme,
      storagePrefix: "my-garden",
      storage: SecureStore,
    }),
  ],
});
