import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createDatabase, type SqliteDatabase } from "../src/db";

describe("generic data API", () => {
  let db: SqliteDatabase;
  let authHeader: string;

  beforeEach(async () => {
    db = createDatabase(":memory:");
    const hash = bcrypt.hashSync("password123", 10);
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      "admin@example.com",
      hash,
    );
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    authHeader = `Bearer ${loginResponse.body.token}`;
  });

  afterEach(() => {
    db.close();
  });

  it("returns metadata for all user tables", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });

    const response = await request(app).get("/api/meta/tables").set("Authorization", authHeader);

    expect(response.status).toBe(200);
    const tableNames = response.body.data.map((table: { name: string }) => table.name);
    expect(tableNames).toContain("master_plants");
    expect(tableNames).toContain("plant_measurements");
  });

  it("blocks unknown table and SQL injection-like table names", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });

    const unknownTableResponse = await request(app)
      .get("/api/tables/does_not_exist/rows")
      .set("Authorization", authHeader);
    expect(unknownTableResponse.status).toBe(404);

    const injectionResponse = await request(app)
      .get("/api/tables/master_plants%3BDROP%20TABLE%20master_plants/rows")
      .set("Authorization", authHeader);
    expect(injectionResponse.status).toBe(404);
  });

  it("rejects unknown columns on dynamic create", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });

    const response = await request(app).post("/api/tables/master_plants/rows").set("Authorization", authHeader).send({
      plant_code: "CABBAGE_001",
      common_name: "Cabbage",
      hacked_field: "should fail",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unknown column");
  });

  it("rejects invalid numeric value on dynamic create", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });

    const response = await request(app).post("/api/tables/master_plants/rows").set("Authorization", authHeader).send({
      plant_code: "SPINACH_001",
      common_name: "Spinach",
      moisture_target: "abc",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("expects a numeric value");
  });

  it("supports full dynamic CRUD lifecycle", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });

    const createResponse = await request(app).post("/api/tables/master_plants/rows").set("Authorization", authHeader).send({
      plant_code: "BASIL_001",
      common_name: "Basil",
      is_active: 1,
    });

    expect(createResponse.status).toBe(201);
    const id = createResponse.body.data.id;
    expect(typeof id).toBe("number");

    const patchResponse = await request(app)
      .patch(`/api/tables/master_plants/rows/${id}`)
      .set("Authorization", authHeader)
      .send({
      common_name: "Sweet Basil",
    });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.data.common_name).toBe("Sweet Basil");

    const deleteResponse = await request(app)
      .delete(`/api/tables/master_plants/rows/${id}`)
      .set("Authorization", authHeader);
    expect(deleteResponse.status).toBe(204);

    const secondDelete = await request(app)
      .delete(`/api/tables/master_plants/rows/${id}`)
      .set("Authorization", authHeader);
    expect(secondDelete.status).toBe(404);
  });

  it("rejects unauthenticated generic access", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const response = await request(app).get("/api/meta/tables");
    expect(response.status).toBe(401);
  });
});
