/// <reference types="vite/client" />

import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const identity = { tokenIdentifier: "favorites-test-user" };

function setup() {
  return convexTest(schema, modules);
}

describe("favorite desired-state writes", () => {
  let t: ReturnType<typeof setup>;

  beforeEach(() => {
    t = setup();
  });

  it("is idempotent across repeated retries", async () => {
    const plantMasterId = await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        isActive: true,
      });
      return await ctx.db.insert("plantsMaster", {
        scientificName: "Solanum lycopersicum",
        group: "nightshades",
        purposes: ["food"],
      });
    });
    const user = t.withIdentity(identity);

    await user.mutation(api.favorites.setFavorite, { plantMasterId, desired: true });
    await user.mutation(api.favorites.setFavorite, { plantMasterId, desired: true });
    expect(await user.query(api.favorites.list)).toHaveLength(1);

    await user.mutation(api.favorites.setFavorite, { plantMasterId, desired: false });
    await user.mutation(api.favorites.setFavorite, { plantMasterId, desired: false });
    expect(await user.query(api.favorites.list)).toHaveLength(0);
  });
});
