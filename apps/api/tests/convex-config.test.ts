import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import {
  CONVEX_CONFIG_ENV_VARS,
  ConvexSyncService,
  getConvexReadiness,
} from "../src/convex-sync";
import { createDatabase, type SqliteDatabase } from "../src/db";

const mutations = {
  upsertMutation: "masterSync:upsertPlantFromBackend",
  deleteMutation: "masterSync:deletePlantFromBackend",
};

function service(config: { deployUrl?: string; adminKey?: string; serviceToken?: string }) {
  return new ConvexSyncService({ ...mutations, ...config });
}

describe("Convex configuration diagnostics", () => {
  it.each([
    {
      name: "missing all values",
      config: {},
      readEnabled: false,
      syncEnabled: false,
      adminEnabled: false,
      missingRead: [CONVEX_CONFIG_ENV_VARS.deployUrl],
      missingAdmin: [
        CONVEX_CONFIG_ENV_VARS.deployUrl,
        CONVEX_CONFIG_ENV_VARS.serviceToken,
      ],
    },
    {
      name: "deployment URL only",
      config: { deployUrl: "https://example.convex.cloud" },
      readEnabled: true,
      syncEnabled: false,
      adminEnabled: false,
      missingRead: [],
      missingAdmin: [CONVEX_CONFIG_ENV_VARS.serviceToken],
    },
    {
      name: "admin key only",
      config: { adminKey: "admin-secret" },
      readEnabled: false,
      syncEnabled: false,
      adminEnabled: false,
      missingRead: [CONVEX_CONFIG_ENV_VARS.deployUrl],
      missingAdmin: [CONVEX_CONFIG_ENV_VARS.deployUrl, CONVEX_CONFIG_ENV_VARS.serviceToken],
    },
    {
      name: "function key only",
      config: { serviceToken: "function-secret" },
      readEnabled: false,
      syncEnabled: false,
      adminEnabled: false,
      missingRead: [CONVEX_CONFIG_ENV_VARS.deployUrl],
      missingAdmin: [CONVEX_CONFIG_ENV_VARS.deployUrl],
    },
    {
      name: "deployment URL and function key",
      config: {
        deployUrl: "https://example.convex.cloud",
        serviceToken: "function-secret",
      },
      readEnabled: true,
      syncEnabled: true,
      adminEnabled: true,
      missingRead: [],
      missingAdmin: [],
    },
    {
      name: "admin key without function key",
      config: { deployUrl: "https://example.convex.cloud", adminKey: "admin-secret" },
      readEnabled: true,
      syncEnabled: false,
      adminEnabled: false,
      missingRead: [],
      missingAdmin: [CONVEX_CONFIG_ENV_VARS.serviceToken],
    },
    {
      name: "complete server configuration",
      config: {
        deployUrl: "https://example.convex.cloud",
        adminKey: "admin-secret",
        serviceToken: "function-secret",
      },
      readEnabled: true,
      syncEnabled: true,
      adminEnabled: true,
      missingRead: [],
      missingAdmin: [],
    },
  ])("reports a value-free readiness matrix for $name", ({
    config,
    readEnabled,
    syncEnabled,
    adminEnabled,
    missingRead,
    missingAdmin,
  }) => {
    const readiness = service(config).getReadiness();

    expect(readiness.read).toEqual({ enabled: readEnabled, missing: missingRead });
    expect(readiness.sync).toEqual({ enabled: syncEnabled, missing: missingAdmin });
    expect(readiness.adminProxy).toEqual({ enabled: adminEnabled, missing: missingAdmin });
    expect(JSON.stringify(readiness)).not.toContain("admin-secret");
    expect(JSON.stringify(readiness)).not.toContain("function-secret");
  });

  it("treats blank environment values as missing", () => {
    const readiness = getConvexReadiness({
      deployUrl: "  ",
      adminKey: " admin-secret ",
      serviceToken: " function-secret ",
    });

    expect(readiness.read).toEqual({
      enabled: false,
      missing: [CONVEX_CONFIG_ENV_VARS.deployUrl],
    });
    expect(readiness.adminProxy).toEqual({
      enabled: false,
      missing: [CONVEX_CONFIG_ENV_VARS.deployUrl],
    });
    expect(JSON.stringify(readiness)).not.toContain("secret");
  });

  it("does not require a deployment admin key for app-function calls", () => {
    const readiness = service({
      deployUrl: "https://example.convex.cloud",
      serviceToken: "function-secret",
    }).getReadiness();

    expect(readiness.sync).toEqual({ enabled: true, missing: [] });
    expect(readiness.adminProxy).toEqual({ enabled: true, missing: [] });
  });
});

describe("Convex app-function transport authentication", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the service token in args without a deployment Authorization header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "success", value: [{ _id: "group-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const convex = service({
      deployUrl: "https://dev.example.convex.cloud",
      adminKey: "prod-deploy-secret",
      serviceToken: "function-secret",
    });

    await expect(convex.adminQuery("plantAdmin:listPlantGroups", {})).resolves.toEqual([{ _id: "group-1" }]);

    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://dev.example.convex.cloud/api/query");
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(JSON.parse(String(init?.body))).toMatchObject({
      path: "plantAdmin:listPlantGroups",
      args: { serviceToken: "function-secret" },
    });
    expect(String(init?.body)).not.toContain("prod-deploy-secret");
  });

  it("uses the same service-token boundary for backend mutations", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "success", value: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const convex = service({
      deployUrl: "https://dev.example.convex.cloud",
      adminKey: "prod-deploy-secret",
      serviceToken: "function-secret",
    });

    await convex.syncUpsert({ id: 42 });

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
    expect(JSON.parse(String(init?.body)).args).toMatchObject({
      serviceToken: "function-secret",
    });
  });
});

describe("Convex health and admin configuration responses", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      "admin@example.com",
      bcrypt.hashSync("password123", 10),
    );
  });

  afterEach(() => {
    db.close();
  });

  it("exposes partial readiness on health without credential values", async () => {
    const app = createApp(db, {
      auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" },
      syncService: service({
        deployUrl: "https://example.convex.cloud",
        adminKey: "admin-secret",
      }),
    });

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.convex).toMatchObject({
      read: { enabled: true, missing: [] },
      sync: { enabled: false, missing: [CONVEX_CONFIG_ENV_VARS.serviceToken] },
      adminProxy: { enabled: false, missing: [CONVEX_CONFIG_ENV_VARS.serviceToken] },
    });
    expect(JSON.stringify(response.body)).not.toContain("admin-secret");
  });

  it("returns an actionable 503 when the admin function key is missing", async () => {
    const app = createApp(db, {
      auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" },
      syncService: service({
        deployUrl: "https://example.convex.cloud",
        adminKey: "admin-secret",
      }),
    });
    const login = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });

    const response = await request(app)
      .post("/api/convex-admin/query")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ path: "plantAdmin:listPlantGroups", args: {} });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      code: "CONVEX_ADMIN_PROXY_NOT_CONFIGURED",
      reason: "missing_server_configuration",
      missing: [CONVEX_CONFIG_ENV_VARS.serviceToken],
      missingVariables: [CONVEX_CONFIG_ENV_VARS.serviceToken],
      action: expect.stringContaining("restart the server"),
      retryable: false,
    });
    expect(response.body.error).toContain("CONVEX_ADMIN_FUNCTION_KEY");
    expect(JSON.stringify(response.body)).not.toContain("admin-secret");
  });
});
