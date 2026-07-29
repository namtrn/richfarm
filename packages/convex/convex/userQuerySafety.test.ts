/// <reference types="vite/client" />

import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');
const identity = {
  subject: 'query-safe-user',
  tokenIdentifier: 'test:query-safe-user',
};

describe('query-safe auth lookup', () => {
  it('does not attempt to patch the user from a query context', async () => {
    const t = convexTest(schema, modules);
    const { userPlantId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {
        tokenIdentifier: identity.tokenIdentifier,
        isActive: true,
      });
      const userPlantId = await ctx.db.insert('userPlants', {
        userId,
        status: 'growing',
        version: 1,
      });
      return { userPlantId };
    });

    const logs = await t.withIdentity(identity).query(api.logs.getLogsForPlant, {
      userPlantId,
      limit: 10,
    });

    expect(logs).toEqual([]);
  });
});
