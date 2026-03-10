import bcrypt from "bcryptjs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createDatabase, type SqliteDatabase } from "../src/db";

describe("master plants API", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const hash = bcrypt.hashSync("password123", 10);
    db.prepare(`INSERT INTO users (email, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)`).run(
      "admin@example.com",
      hash,
    );
  });

  afterEach(() => {
    db.close();
  });

  it("creates and lists master plants", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const createResponse = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "TOMATO_001",
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum",
      soil_ph_min: 5.5,
      soil_ph_max: 6.8,
      moisture_target: 60,
      light_hours: 8,
      metadata_json: {
        source: "seed-bank",
      },
      i18n: {
        vi: { common_name: "Cà chua", description: "Cây cà chua" },
        en: { common_name: "Tomato", description: "Tomato plant" },
      },
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.plant_code).toBe("TOMATO_001");
    expect(createResponse.body.data.metadata_json.source).toBe("seed-bank");

    const listResponse = await request(app).get("/api/master-plants").set("Authorization", authHeader);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.pagination.total).toBe(1);
  });

  it("rejects invalid pH ranges", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "PEPPER_001",
      common_name: "Pepper",
      soil_ph_min: 7,
      soil_ph_max: 6,
      i18n: {
        vi: { common_name: "Ớt" },
        en: { common_name: "Pepper" },
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("requires i18n for create", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app).post("/api/master-plants").set("Authorization", authHeader).send({
      plant_code: "NO_I18N",
      common_name: "Missing I18n",
    });

    expect(response.status).toBe(400);
  });

  it("rejects duplicate plant_code with conflict status", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const payload = {
      plant_code: "LETTUCE_001",
      common_name: "Lettuce",
      i18n: {
        vi: { common_name: "Xà lách" },
        en: { common_name: "Lettuce" },
      },
    };

    const firstResponse = await request(app).post("/api/master-plants").set("Authorization", authHeader).send(payload);
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app).post("/api/master-plants").set("Authorization", authHeader).send(payload);
    expect(duplicateResponse.status).toBe(409);
  });

  it("returns 404 when updating non-existing master plant", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app).patch("/api/master-plants/999").set("Authorization", authHeader).send({
      common_name: "Ghost Plant",
    });

    expect(response.status).toBe(404);
  });

  it("validates pagination query parameters", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "admin@example.com",
      password: "password123",
    });
    const authHeader = `Bearer ${loginResponse.body.token}`;

    const response = await request(app)
      .get("/api/master-plants?page=0&page_size=500")
      .set("Authorization", authHeader);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("allows unauthenticated read access", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const response = await request(app).get("/api/master-plants");
    expect(response.status).toBe(200);
  });

  it("blocks unauthenticated write access", async () => {
    const app = createApp(db, { auth: { jwtSecret: "test-secret", jwtExpiresIn: "1h" } });
    const response = await request(app).post("/api/master-plants").send({
      plant_code: "NOAUTH_001",
      common_name: "No Auth",
      i18n: {
        vi: { common_name: "Khong auth" },
        en: { common_name: "No auth" },
      },
    });
    expect(response.status).toBe(401);
  });
});
