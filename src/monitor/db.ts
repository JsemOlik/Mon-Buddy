import { Database } from "bun:sqlite";
import type { StockStatus } from "./scrapers/base.ts";

export interface ProductRow {
  id: number;
  url: string;
  store: string;
  label: string;
  stock: StockStatus;
  last_checked: number | null;
  added_by: string;
  added_at: number;
  guild_id: string;
}

// Automatically switch between SQLite (local) and PostgreSQL (production)
// based on whether DATABASE_URL starts with "postgres".
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const USE_PG = DATABASE_URL.startsWith("postgres");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sql: any = null;
let db: Database | null = null;

// Creates all required tables if they don't already exist.
// Called once at bot startup before anything else touches the database.
export async function initDb(): Promise<void> {
  if (USE_PG) {
    const { default: postgres } = await import("postgres");
    sql = postgres(DATABASE_URL, { max: 10 });
    await sql`
      CREATE TABLE IF NOT EXISTS monitored_products (
        id           SERIAL PRIMARY KEY,
        url          TEXT    NOT NULL UNIQUE,
        store        TEXT    NOT NULL,
        label        TEXT    NOT NULL,
        stock        TEXT    NOT NULL DEFAULT 'not-in-stock',
        last_checked BIGINT,
        added_by     TEXT    NOT NULL,
        added_at     BIGINT  NOT NULL,
        guild_id     TEXT    NOT NULL DEFAULT ''
      )
    `;
    // Migrate legacy in_stock column if it exists
    await sql`ALTER TABLE monitored_products ADD COLUMN IF NOT EXISTS stock TEXT NOT NULL DEFAULT 'not-in-stock'`;
    await sql`UPDATE monitored_products SET stock = 'in-stock' WHERE in_stock = 1 AND stock = 'not-in-stock'`;
    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `;
    await sql`INSERT INTO config (key, value) VALUES ('alert_channel_id', '') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO config (key, value) VALUES ('poll_interval_ms', '30000') ON CONFLICT DO NOTHING`;
    await sql`UPDATE config SET value = '30000' WHERE key = 'poll_interval_ms' AND value = '300000'`;
    await sql`
      CREATE TABLE IF NOT EXISTS stock_events (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES monitored_products(id) ON DELETE CASCADE,
        event       TEXT    NOT NULL,
        detected_at BIGINT  NOT NULL
      )
    `;
    return;
  }

  db = new Database("poke-buddy.db", { create: true });
  db.run("PRAGMA foreign_keys = ON");
  db.run("PRAGMA journal_mode = WAL");
  db.run(`
    CREATE TABLE IF NOT EXISTS monitored_products (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      url          TEXT    NOT NULL UNIQUE,
      store        TEXT    NOT NULL,
      label        TEXT    NOT NULL,
      stock        TEXT    NOT NULL DEFAULT 'not-in-stock',
      last_checked INTEGER,
      added_by     TEXT    NOT NULL,
      added_at     INTEGER NOT NULL,
      guild_id     TEXT    NOT NULL DEFAULT ''
    )
  `);
  // Migrations for existing databases
  try { db.run(`ALTER TABLE monitored_products ADD COLUMN stock TEXT NOT NULL DEFAULT 'not-in-stock'`); } catch { /* already exists */ }
  try { db.run(`UPDATE monitored_products SET stock = 'in-stock' WHERE in_stock = 1 AND stock = 'not-in-stock'`); } catch { /* in_stock column may not exist */ }
  try { db.run(`ALTER TABLE monitored_products ADD COLUMN guild_id TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(`INSERT OR IGNORE INTO config VALUES ('alert_channel_id', '')`);
  db.run(`INSERT OR IGNORE INTO config VALUES ('poll_interval_ms', '30000')`);
  db.run(`UPDATE config SET value = '30000' WHERE key = 'poll_interval_ms' AND value = '300000'`);
  db.run(`
    CREATE TABLE IF NOT EXISTS stock_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL REFERENCES monitored_products(id) ON DELETE CASCADE,
      event       TEXT    NOT NULL,
      detected_at INTEGER NOT NULL
    )
  `);
}

// PostgreSQL returns BigInt for BIGINT/SERIAL columns — normalise everything
// to plain JS numbers so callers don't need to know which DB is active.
function pgRow(row: Record<string, unknown>): ProductRow {
  return {
    id: Number(row["id"]),
    url: row["url"] as string,
    store: row["store"] as string,
    label: row["label"] as string,
    stock: (row["stock"] as StockStatus) ?? "not-in-stock",
    last_checked: row["last_checked"] != null ? Number(row["last_checked"]) : null,
    added_by: row["added_by"] as string,
    added_at: Number(row["added_at"]),
    guild_id: row["guild_id"] as string,
  };
}

export async function addProduct(
  url: string,
  store: string,
  label: string,
  addedBy: string,
  guildId = "",
): Promise<ProductRow> {
  const addedAt = Date.now();
  if (USE_PG) {
    try {
      const rows = await sql`
        INSERT INTO monitored_products (url, store, label, added_by, added_at, guild_id)
        VALUES (${url}, ${store}, ${label}, ${addedBy}, ${addedAt}, ${guildId})
        RETURNING *
      `;
      if (!rows[0]) throw new Error("Failed to insert product");
      return pgRow(rows[0] as Record<string, unknown>);
    } catch (err: unknown) {
      // Normalise PostgreSQL's unique violation to the same message SQLite throws.
      if ((err as { code?: string }).code === "23505") throw new Error("UNIQUE constraint failed: url");
      throw err;
    }
  }
  const row = db!.prepare<ProductRow, [string, string, string, string, number, string]>(
    `INSERT INTO monitored_products (url, store, label, added_by, added_at, guild_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     RETURNING *`,
  ).get(url, store, label, addedBy, addedAt, guildId);
  if (!row) throw new Error("Failed to insert product");
  return row;
}

export async function listProductsByGuild(guildId: string): Promise<ProductRow[]> {
  if (USE_PG) {
    const rows = await sql`SELECT * FROM monitored_products WHERE guild_id = ${guildId} ORDER BY added_at DESC`;
    return (rows as Record<string, unknown>[]).map(pgRow);
  }
  return db!.prepare<ProductRow, [string]>(
    `SELECT * FROM monitored_products WHERE guild_id = ?1 ORDER BY added_at DESC`,
  ).all(guildId);
}

export async function removeProduct(id: number): Promise<boolean> {
  if (USE_PG) {
    const rows = await sql`DELETE FROM monitored_products WHERE id = ${id} RETURNING id`;
    return (rows as unknown[]).length > 0;
  }
  const row = db!.prepare<{ id: number }, [number]>(
    `DELETE FROM monitored_products WHERE id = ?1 RETURNING id`,
  ).get(id);
  return row !== null;
}

export async function listProducts(): Promise<ProductRow[]> {
  if (USE_PG) {
    const rows = await sql`SELECT * FROM monitored_products ORDER BY added_at DESC`;
    return (rows as Record<string, unknown>[]).map(pgRow);
  }
  return db!.prepare<ProductRow, []>(
    `SELECT * FROM monitored_products ORDER BY added_at DESC`,
  ).all();
}

export async function getProduct(id: number): Promise<ProductRow | null> {
  if (USE_PG) {
    const rows = await sql`SELECT * FROM monitored_products WHERE id = ${id}`;
    const row = (rows as Record<string, unknown>[])[0];
    return row ? pgRow(row) : null;
  }
  return db!.prepare<ProductRow, [number]>(
    `SELECT * FROM monitored_products WHERE id = ?1`,
  ).get(id) ?? null;
}

// Updates the stock status and appends a timestamped event row for history.
export async function setStock(id: number, stock: StockStatus): Promise<void> {
  const now = Date.now();
  if (USE_PG) {
    await sql`UPDATE monitored_products SET stock = ${stock}, last_checked = ${now} WHERE id = ${id}`;
    await sql`INSERT INTO stock_events (product_id, event, detected_at) VALUES (${id}, ${stock}, ${now})`;
    return;
  }
  db!.prepare<void, [string, number, number]>(
    `UPDATE monitored_products SET stock = ?1, last_checked = ?2 WHERE id = ?3`,
  ).run(stock, now, id);
  db!.prepare<void, [number, string, number]>(
    `INSERT INTO stock_events (product_id, event, detected_at) VALUES (?1, ?2, ?3)`,
  ).run(id, stock, now);
}

export async function getConfig(key: string): Promise<string | null> {
  if (USE_PG) {
    const rows = await sql`SELECT value FROM config WHERE key = ${key}`;
    return ((rows as { value: string }[])[0])?.value ?? null;
  }
  return db!.prepare<{ value: string }, [string]>(
    `SELECT value FROM config WHERE key = ?1`,
  ).get(key)?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  if (USE_PG) {
    await sql`
      INSERT INTO config (key, value) VALUES (${key}, ${value})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    return;
  }
  db!.prepare<void, [string, string]>(
    `INSERT INTO config (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
