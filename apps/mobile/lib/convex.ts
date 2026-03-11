import { ConvexReactClient } from 'convex/react';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error('EXPO_PUBLIC_CONVEX_URL is not set');
}

export function createConvexClient() {
  return new ConvexReactClient(convexUrl, { logger: false });
}

export const convex = createConvexClient();
