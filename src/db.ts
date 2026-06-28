import knex, { Knex } from "knex";
import { getConfig } from "./config.js";

let _db: Knex | null = null;

export function getDb(): Knex {
  if (_db) return _db;
  const { db } = getConfig();

  switch (db.client) {
    case "sqlite":
      _db = knex({
        client: "better-sqlite3",
        connection: { filename: db.filename ?? "./invoice.db" },
        useNullAsDefault: true,
      });
      break;
    case "postgresql":
      _db = knex({
        client: "pg",
        connection: { host: db.host, port: db.port, user: db.user, password: db.password, database: db.database },
        pool: { min: 0, max: 10 },
      });
      break;
    case "mysql":
      _db = knex({
        client: "mysql2",
        connection: { host: db.host, port: db.port, user: db.user, password: db.password, database: db.database },
        pool: { min: 0, max: 10 },
      });
      break;
    case "mssql":
      _db = knex({
        client: "mssql",
        connection: {
          server: db.host ?? "localhost",
          port: db.port ?? 1433,
          user: db.user,
          password: db.password,
          database: db.database,
          options: { enableArithAbort: true, encrypt: false },
        },
        pool: { min: 0, max: 10 },
      });
      break;
  }

  return _db!;
}

export async function closeDb(): Promise<void> {
  if (_db) { await _db.destroy(); _db = null; }
}

export async function runMigrations(): Promise<void> {
  const db = getDb();

  if (!(await db.schema.hasTable("clients"))) {
    await db.schema.createTable("clients", (t) => {
      t.increments("id").primary();
      t.string("name", 128).notNullable();
      t.string("email", 128).nullable();
      t.string("address", 255).nullable();
      t.string("tax_id", 64).nullable();
      t.string("currency", 3).notNullable().defaultTo("USD");
      t.timestamps(true, true);
    });
  }

  if (!(await db.schema.hasTable("invoices"))) {
    await db.schema.createTable("invoices", (t) => {
      t.increments("id").primary();
      t.string("number", 32).notNullable().unique();
      t.integer("client_id").notNullable().references("id").inTable("clients");
      t.date("date").notNullable();
      t.date("due_date").notNullable();
      t.string("currency", 3).notNullable().defaultTo("USD");
      t.decimal("subtotal", 12, 2).notNullable().defaultTo(0);
      t.decimal("tax_rate", 5, 2).notNullable().defaultTo(0);
      t.decimal("tax_amount", 12, 2).notNullable().defaultTo(0);
      t.decimal("total", 12, 2).notNullable().defaultTo(0);
      t.enum("status", ["draft", "sent", "paid", "overdue"]).notNullable().defaultTo("draft");
      t.string("notes", 512).nullable();
      t.string("pdf_path", 512).nullable();
      t.timestamps(true, true);
    });
  }

  if (!(await db.schema.hasTable("invoice_items"))) {
    await db.schema.createTable("invoice_items", (t) => {
      t.increments("id").primary();
      t.integer("invoice_id").notNullable().references("id").inTable("invoices").onDelete("CASCADE");
      t.string("description", 255).notNullable();
      t.decimal("quantity", 10, 2).notNullable().defaultTo(1);
      t.decimal("unit_price", 12, 2).notNullable();
      t.decimal("total", 12, 2).notNullable();
    });
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface Client {
  id?: number;
  name: string;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  currency: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Invoice {
  id?: number;
  number: string;
  client_id: number;
  date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue";
  notes?: string | null;
  pdf_path?: string | null;
}
