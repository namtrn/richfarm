/// <reference types="vite/client" />
import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = { subject: "favorite-user", tokenIdentifier: "test:favorite-user" };

describe("favorite desired-state writes", () => {
  let t: ReturnType<typeof convexTest>;
  let plantMasterId: any;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    plantMasterId = await t.run(async (ctx) => {
      await ctx.db.insert("users", { tokenIdentifier: identity.tokenIdentifier, isActive: true });
      return await ctx.db.insert("plantsMaster", {
        scientificName: "Ocimum basilicum",
        group: "herbs",
        purposes: ["culinary"],
      });
    });
  });

  it("is idempotent when a successful response is lost and replayed", async () => {
    const user = t.withIdentity(identity);
    await expect(user.mutation(api.favorites.setFavorite, { plantMasterId, desired: true })).resolves.toEqual({ favorited: true });
    await expect(user.mutation(api.favorites.setFavorite, { plantMasterId, desired: true })).resolves.toEqual({ favorited: true });
    expect(await user.query(api.favorites.list, {})).toHaveLength(1);
    await user.mutation(api.favorites.setFavorite, { plantMasterId, desired: false });
    await user.mutation(api.favorites.setFavorite, { plantMasterId, desired: false });
    expect(await user.query(api.favorites.list, {})).toHaveLength(0);
  });
});
