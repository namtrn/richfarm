/// <reference types="vite/client" />

import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { AI_SCAN_DAILY_LIMIT } from './lib/aiScanLimit';

const modules = import.meta.glob('./**/*.ts');
const identity = { subject: 'scan-user', tokenIdentifier: 'test:scan-user' };
const IMAGE = '/9j/fake';

function mockGemini(ok = true) {
  vi.stubEnv('GEMINI_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn(async () => ok
    ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"match":null,"alternatives":[]}' }] } }] }), { status: 200 })
    : new Response('boom', { status: 500 })));
}

async function setup(premium = false) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('users', {
      tokenIdentifier: identity.tokenIdentifier,
      isActive: true,
      ...(premium ? { subscription: { tier: 'premium', source: 'revenuecat' } } : {}),
    });
  });
  return t;
}

async function scanUntilBlocked(t: ReturnType<typeof convexTest>) {
  const client = t.withIdentity(identity);
  let succeeded = 0;
  for (let i = 0; i < 20; i += 1) {
    try {
      await client.action(api.plantScan.detectPlant, { images: [IMAGE] });
      succeeded += 1;
    } catch (error: any) {
      expect(error.data?.code).toBe('AI_SCAN_LIMIT_REACHED');
      break;
    }
  }
  return succeeded;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('AI scan quota', () => {
  it('requires sign in', async () => {
    mockGemini();
    const t = await setup();
    await expect(t.action(api.plantScan.detectPlant, { images: [IMAGE] })).rejects.toMatchObject({
      data: { code: 'AUTH_REQUIRED' },
    });
    expect(await t.query(api.aiScanQuota.getScanQuota, {})).toBeNull();
  });

  it('allows free users the free daily limit', async () => {
    mockGemini();
    const t = await setup();
    expect(await scanUntilBlocked(t)).toBe(AI_SCAN_DAILY_LIMIT.free);
    expect(await t.withIdentity(identity).query(api.aiScanQuota.getScanQuota, {})).toEqual({
      used: AI_SCAN_DAILY_LIMIT.free,
      limit: AI_SCAN_DAILY_LIMIT.free,
      remaining: 0,
    });
  });

  it('allows premium users the premium daily limit', async () => {
    mockGemini();
    const t = await setup(true);
    expect(await scanUntilBlocked(t)).toBe(AI_SCAN_DAILY_LIMIT.premium);
  });

  it('does not count failed scans', async () => {
    mockGemini(false);
    const t = await setup();
    const client = t.withIdentity(identity);
    await expect(client.action(api.plantScan.detectPlant, { images: [IMAGE] })).rejects.toThrow();
    expect(await client.query(api.aiScanQuota.getScanQuota, {})).toMatchObject({ used: 0 });
  });
});
