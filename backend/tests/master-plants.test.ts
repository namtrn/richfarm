import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { createDatabase, type SqliteDatabase } from "../src/db";

describe("master plants API", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates and lists master plants", async () => {
    const app = createApp(db);

    const createResponse = await request(app).post("/api/master-plants").send({
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
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.plant_code).toBe("TOMATO_001");
    expect(createResponse.body.data.metadata_json.source).toBe("seed-bank");

    const listResponse = await request(app).get("/api/master-plants");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.pagination.total).toBe(1);
  });

  it("rejects invalid pH ranges", async () => {
    const app = createApp(db);

    const response = await request(app).post("/api/master-plants").send({
      plant_code: "PEPPER_001",
      common_name: "Pepper",
      soil_ph_min: 7,
      soil_ph_max: 6,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("rejects duplicate plant_code with conflict status", async () => {
    const app = createApp(db);

    const payload = {
      plant_code: "LETTUCE_001",
      common_name: "Lettuce",
    };

    const firstResponse = await request(app).post("/api/master-plants").send(payload);
    expect(firstResponse.status).toBe(201);

    const duplicateResponse = await request(app).post("/api/master-plants").send(payload);
    expect(duplicateResponse.status).toBe(409);
  });

  it("returns 404 when updating non-existing master plant", async () => {
    const app = createApp(db);

    const response = await request(app).patch("/api/master-plants/999").send({
      common_name: "Ghost Plant",
    });

    expect(response.status).toBe(404);
  });

  it("validates pagination query parameters", async () => {
    const app = createApp(db);

    const response = await request(app).get("/api/master-plants?page=0&page_size=500");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});
