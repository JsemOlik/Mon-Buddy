import { Database } from "bun:sqlite";

const db = new Database("poke-buddy.db", { create: true });

db.run("PRAGMA foreign_keys = ON");
db.run("PRAGMA journal_mode = WAL");

db.run(`
  CREATE TABLE IF NOT EXISTS monitored_products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    url          TEXT    NOT NULL UNIQUE,
    store        TEXT    NOT NULL,
    label        TEXT    NOT NULL,
    in_stock     INTEGER NOT NULL DEFAULT 0,
    last_checked INTEGER,
    added_by     TEXT    NOT NULL,
    added_at     INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

db.run(`INSERT OR IGNORE INTO config VALUES ('alert_channel_id', '')`);
db.run(`INSERT OR IGNORE INTO config VALUES ('poll_interval_ms', '30000')`);
// Migrate old default (5 min) to new default (30 s) — leaves custom values untouched
db.run(`UPDATE config SET value = '30000' WHERE key = 'poll_interval_ms' AND value = '300000'`);

db.run(`
  CREATE TABLE IF NOT EXISTS stock_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES monitored_products(id) ON DELETE CASCADE,
    event       TEXT    NOT NULL,
    detected_at INTEGER NOT NULL
  )
`);

export interface ProductRow {
  id: number;
  url: string;
  store: string;
  label: string;
  in_stock: 0 | 1;
  last_checked: number | null;
  added_by: string;
  added_at: number;
}

const stmtAdd = db.prepare<ProductRow, [string, string, string, string, number]>(
  `INSERT INTO monitored_products (url, store, label, added_by, added_at)
   VALUES (?1, ?2, ?3, ?4, ?5)
   RETURNING *`
);

const stmtRemove = db.prepare<{ id: number }, [number]>(
  `DELETE FROM monitored_products WHERE id = ?1 RETURNING id`
);

const stmtList = db.prepare<ProductRow, []>(
  `SELECT * FROM monitored_products ORDER BY added_at DESC`
);

const stmtGet = db.prepare<ProductRow, [number]>(
  `SELECT * FROM monitored_products WHERE id = ?1`
);

const stmtSetInStock = db.prepare<void, [number, number, number]>(
  `UPDATE monitored_products SET in_stock = ?1, last_checked = ?2 WHERE id = ?3`
);

const stmtGetConfig = db.prepare<{ value: string }, [string]>(
  `SELECT value FROM config WHERE key = ?1`
);

const stmtSetConfig = db.prepare<void, [string, string]>(
  `INSERT INTO config (key, value) VALUES (?1, ?2)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);

const stmtLogEvent = db.prepare<void, [number, string, number]>(
  `INSERT INTO stock_events (product_id, event, detected_at) VALUES (?1, ?2, ?3)`
);

export function addProduct(url: string, store: string, label: string, addedBy: string): ProductRow {
  const row = stmtAdd.get(url, store, label, addedBy, Date.now());
  if (!row) throw new Error("Failed to insert product");
  return row;
}

export function removeProduct(id: number): boolean {
  const row = stmtRemove.get(id);
  return row !== null;
}

export function listProducts(): ProductRow[] {
  return stmtList.all();
}

export function getProduct(id: number): ProductRow | null {
  return stmtGet.get(id) ?? null;
}

export function setInStock(id: number, inStock: boolean): void {
  stmtSetInStock.run(inStock ? 1 : 0, Date.now(), id);
  stmtLogEvent.run(id, inStock ? "in_stock" : "out_of_stock", Date.now());
}

export function getConfig(key: string): string | null {
  return stmtGetConfig.get(key)?.value ?? null;
}

export function setConfig(key: string, value: string): void {
  stmtSetConfig.run(key, value);
}
