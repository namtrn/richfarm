import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');
const serviceToken = 'care-date-migration-test-token';

describe('care content display-date backfill', () => {
  const previousToken = process.env.CONVEX_ADMIN_FUNCTION_KEY;
  beforeEach(() => { process.env.CONVEX_ADMIN_FUNCTION_KEY = serviceToken; });
  afterEach(() => {
    if (previousToken === undefined) delete process.env.CONVEX_ADMIN_FUNCTION_KEY;
    else process.env.CONVEX_ADMIN_FUNCTION_KEY = previousToken;
  });

  it('uses stable source identities and is idempotent', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const sourceId of ['459', '983']) {
        const plantId = await ctx.db.insert('plantsMaster', {
          scientificName: 'Mutable display name', group: 'vegetables', purposes: [],
          sourceSystem: 'sqlite', sourceId,
        });
        for (const locale of ['vi', 'en']) {
          await ctx.db.insert('plantCareI18n', {
            plantId, locale, careContent: '# Guide', contentStatus: 'published',
          });
        }
      }
      const other = await ctx.db.insert('plantsMaster', {
        scientificName: 'Other', group: 'other', purposes: [], sourceSystem: 'sqlite', sourceId: '1000',
      });
      await ctx.db.insert('plantCareI18n', {
        plantId: other, locale: 'en', careContent: '# Other', contentStatus: 'published',
      });
    });

    const migrationApi = (api as any).careContentUpdatedAtMigration.backfill;
    const dryRun = await t.mutation(migrationApi, { serviceToken });
    expect(dryRun).toMatchObject({ dryRun: true, eligible: 5, recent: 4, changed: 5 });
    const applied = await t.mutation(migrationApi, { serviceToken, dryRun: false });
    expect(applied.changed).toBe(5);
    const second = await t.mutation(migrationApi, { serviceToken, dryRun: false });
    expect(second.changed).toBe(0);

    const rows = await t.run(async (ctx) => await ctx.db.query('plantCareI18n').collect());
    expect(rows.filter((row: any) => row.contentUpdatedAt === Date.parse('2026-08-13T00:00:00.000Z'))).toHaveLength(4);
    expect(rows.filter((row: any) => row.contentUpdatedAt === Date.parse('2026-07-13T00:00:00.000Z'))).toHaveLength(1);
  });
});
