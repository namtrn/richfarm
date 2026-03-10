import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import {
  getAllTableMetadata,
  getTableMetadata,
  type ColumnMetadata,
  type SqliteDatabase,
  type TableMetadata,
} from "./db";
import { isNumericType, quoteIdentifier } from "./sql-utils";

const listRowsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.string().trim().min(1).max(120).optional(),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

function decodeJsonFields(row: Record<string, unknown>, columns: ColumnMetadata[]): Record<string, unknown> {
  const nextRow: Record<string, unknown> = { ...row };

  for (const column of columns) {
    const rawValue = row[column.name];
    const shouldTryParseJson =
      typeof rawValue === "string" &&
      (column.name.endsWith("_json") || column.type.toUpperCase().includes("JSON"));

    if (!shouldTryParseJson) {
      continue;
    }

    try {
      nextRow[column.name] = JSON.parse(rawValue);
    } catch {
      nextRow[column.name] = rawValue;
    }
  }

  return nextRow;
}

function getPrimaryKey(table: TableMetadata): ColumnMetadata | null {
  if (!table.primaryKey) {
    return null;
  }

  return table.columns.find((column) => column.name === table.primaryKey) ?? null;
}

function parsePrimaryKeyFromParam(rawId: string, primaryKeyColumn: ColumnMetadata): string | number {
  if (isNumericType(primaryKeyColumn.type)) {
    const numericValue = Number(rawId);
    if (!Number.isFinite(numericValue)) {
      throw new Error(`Primary key value '${rawId}' is invalid`);
    }

    return numericValue;
  }

  return rawId;
}

function normalizeValueByColumn(value: unknown, column: ColumnMetadata): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0 && !column.notNull) {
      return null;
    }

    if (isNumericType(column.type)) {
      const numericValue = Number(trimmed);
      if (!Number.isFinite(numericValue)) {
        throw new Error(`Column '${column.name}' expects a numeric value`);
      }
      return numericValue;
    }

    if (column.name.endsWith("_json") || column.type.toUpperCase().includes("JSON")) {
      JSON.parse(trimmed);
      return trimmed;
    }

    return trimmed;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Column '${column.name}' expects a finite number`);
    }

    if (!isNumericType(column.type)) {
      return String(value);
    }

    return value;
  }

  if (typeof value === "boolean") {
    if (isNumericType(column.type)) {
      return value ? 1 : 0;
    }

    return value ? "true" : "false";
  }

  if (typeof value === "object") {
    if (column.name.endsWith("_json") || column.type.toUpperCase().includes("JSON")) {
      return JSON.stringify(value);
    }

    throw new Error(`Column '${column.name}' does not accept object values`);
  }

  return value;
}

function getTableOrThrow(db: SqliteDatabase, tableName: string): TableMetadata {
  const table = getTableMetadata(db, tableName);
  if (!table) {
    throw new Error(`Table '${tableName}' not found`);
  }

  return table;
}

function isProtectedTable(tableName: string): boolean {
  return tableName === "master_plants" || tableName === "master_plant_i18n";
}

function getSingleParam(value: string | string[] | undefined, name: string): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  throw new Error(`Missing route param '${name}'`);
}

function sanitizePayload(payload: unknown, table: TableMetadata) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Request body must be an object");
  }

  const payloadRecord = payload as Record<string, unknown>;
  const validColumns = new Map(table.columns.map((column) => [column.name, column]));

  const preparedEntries: Array<[string, unknown]> = [];

  for (const [key, value] of Object.entries(payloadRecord)) {
    const column = validColumns.get(key);
    if (!column) {
      throw new Error(`Unknown column '${key}' for table '${table.name}'`);
    }

    preparedEntries.push([key, normalizeValueByColumn(value, column)]);
  }

  return preparedEntries;
}

export function createGenericDataRouter(db: SqliteDatabase): Router {
  const router = Router();

  router.get("/meta/tables", (_req: Request, res: Response) => {
    const tables = getAllTableMetadata(db);
    res.json({ data: tables });
  });

  router.get("/tables/:tableName/rows", (req: Request, res: Response, next: NextFunction) => {
    try {
      const tableName = getSingleParam(req.params.tableName, "tableName");
      const table = getTableOrThrow(db, tableName);
      const query = listRowsQuerySchema.parse(req.query);
      const sortColumn = query.sort ?? table.primaryKey ?? table.columns[0].name;

      if (!table.columns.find((column) => column.name === sortColumn)) {
        res.status(400).json({ error: `Sort column '${sortColumn}' not found` });
        return;
      }

      const quotedTable = quoteIdentifier(table.name);
      const quotedSortColumn = quoteIdentifier(sortColumn);

      const rows = db
        .prepare(
          `SELECT * FROM ${quotedTable} ORDER BY ${quotedSortColumn} ${query.direction.toUpperCase()} LIMIT ? OFFSET ?`,
        )
        .all(query.limit, query.offset) as Record<string, unknown>[];

      const countRow = db.prepare(`SELECT COUNT(*) as total FROM ${quotedTable}`).get() as { total: number };

      res.json({
        table,
        data: rows.map((row) => decodeJsonFields(row, table.columns)),
        pagination: {
          total: countRow.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tables/:tableName/rows", (req: Request, res: Response, next: NextFunction) => {
    try {
      const tableName = getSingleParam(req.params.tableName, "tableName");
      if (isProtectedTable(tableName)) {
        res.status(400).json({ error: `Use /api/master-plants for ${tableName}` });
        return;
      }
      const table = getTableOrThrow(db, tableName);
      const primaryKey = getPrimaryKey(table);
      const entries = sanitizePayload(req.body, table);

      if (entries.length === 0) {
        res.status(400).json({ error: "At least one column is required" });
        return;
      }

      const columns = entries.map(([key]) => quoteIdentifier(key)).join(", ");
      const placeholders = entries.map(() => "?").join(", ");
      const values = entries.map(([, value]) => value);

      const quotedTable = quoteIdentifier(table.name);
      const insertResult = db
        .prepare(`INSERT INTO ${quotedTable} (${columns}) VALUES (${placeholders})`)
        .run(...values);

      let insertedRow: Record<string, unknown> | undefined;

      if (primaryKey) {
        const pkValue = isNumericType(primaryKey.type)
          ? Number(insertResult.lastInsertRowid)
          : req.body[primaryKey.name];

        insertedRow = db
          .prepare(
            `SELECT * FROM ${quotedTable} WHERE ${quoteIdentifier(primaryKey.name)} = ? LIMIT 1`,
          )
          .get(pkValue) as Record<string, unknown> | undefined;
      }

      res.status(201).json({
        table,
        data: insertedRow ? decodeJsonFields(insertedRow, table.columns) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/tables/:tableName/rows/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const tableName = getSingleParam(req.params.tableName, "tableName");
      if (isProtectedTable(tableName)) {
        res.status(400).json({ error: `Use /api/master-plants for ${tableName}` });
        return;
      }
      const table = getTableOrThrow(db, tableName);
      const primaryKey = getPrimaryKey(table);

      if (!primaryKey) {
        res.status(400).json({ error: `Table '${table.name}' does not have a primary key` });
        return;
      }

      const rowId = parsePrimaryKeyFromParam(getSingleParam(req.params.id, "id"), primaryKey);
      const entries = sanitizePayload(req.body, table).filter(([key]) => key !== primaryKey.name);

      if (entries.length === 0) {
        res.status(400).json({ error: "No updatable columns provided" });
        return;
      }

      const quotedTable = quoteIdentifier(table.name);
      const quotedPrimaryKey = quoteIdentifier(primaryKey.name);

      const exists = db
        .prepare(`SELECT ${quotedPrimaryKey} FROM ${quotedTable} WHERE ${quotedPrimaryKey} = ? LIMIT 1`)
        .get(rowId);

      if (!exists) {
        res.status(404).json({ error: `Row with id '${req.params.id}' not found` });
        return;
      }

      const updateClause = entries.map(([key]) => `${quoteIdentifier(key)} = ?`).join(", ");
      const updateValues = entries.map(([, value]) => value);

      db.prepare(`UPDATE ${quotedTable} SET ${updateClause} WHERE ${quotedPrimaryKey} = ?`).run(
        ...updateValues,
        rowId,
      );

      const updatedRow = db
        .prepare(`SELECT * FROM ${quotedTable} WHERE ${quotedPrimaryKey} = ? LIMIT 1`)
        .get(rowId) as Record<string, unknown> | undefined;

      res.json({
        table,
        data: updatedRow ? decodeJsonFields(updatedRow, table.columns) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/tables/:tableName/rows/:id", (req: Request, res: Response, next: NextFunction) => {
    try {
      const tableName = getSingleParam(req.params.tableName, "tableName");
      if (isProtectedTable(tableName)) {
        res.status(400).json({ error: `Use /api/master-plants for ${tableName}` });
        return;
      }
      const table = getTableOrThrow(db, tableName);
      const primaryKey = getPrimaryKey(table);

      if (!primaryKey) {
        res.status(400).json({ error: `Table '${table.name}' does not have a primary key` });
        return;
      }

      const rowId = parsePrimaryKeyFromParam(getSingleParam(req.params.id, "id"), primaryKey);
      const quotedTable = quoteIdentifier(table.name);
      const quotedPrimaryKey = quoteIdentifier(primaryKey.name);

      const result = db
        .prepare(`DELETE FROM ${quotedTable} WHERE ${quotedPrimaryKey} = ?`)
        .run(rowId);

      if (result.changes === 0) {
        res.status(404).json({ error: `Row with id '${req.params.id}' not found` });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
