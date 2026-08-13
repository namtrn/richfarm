import { ConvexReactClient } from 'convex/react';

function requireConvexUrl(): string {
  const value = process.env.EXPO_PUBLIC_CONVEX_URL;
  if (!value) {
    throw new Error('EXPO_PUBLIC_CONVEX_URL is not set');
  }
  return value;
}

const convexUrl = requireConvexUrl();

export function createConvexClient() {
  return new ConvexReactClient(convexUrl, { logger: false });
}

export const convex = createConvexClient();
