import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const localEnv = path.join(process.cwd(), ".env");
const homeEnv = path.join(
  process.env["HOME"] ?? process.env["USERPROFILE"] ?? "",
  ".invoice-cli.env"
);

if (fs.existsSync(localEnv)) {
  dotenv.config({ path: localEnv });
} else if (fs.existsSync(homeEnv)) {
  dotenv.config({ path: homeEnv });
} else {
  process.env["DB_CLIENT"] = process.env["DB_CLIENT"] ?? "sqlite";
  process.env["DB_FILENAME"] = process.env["DB_FILENAME"] ?? "./invoice.db";
}

export type DbClient = "sqlite" | "postgresql" | "mysql" | "mssql";

export interface AppConfig {
  db: {
    client: DbClient;
    filename?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
  };
  sender: {
    name: string;
    email: string;
    address: string;
    taxId: string;
  };
  defaultCurrency: string;
  outputDir: string;
}

export function getConfig(): AppConfig {
  const raw = (process.env["DB_CLIENT"] ?? "sqlite").toLowerCase();
  const client: DbClient = ["sqlite", "postgresql", "mysql", "mssql"].includes(raw)
    ? (raw as DbClient)
    : "sqlite";

  return {
    db: {
      client,
      filename: process.env["DB_FILENAME"] ?? "./invoice.db",
      host: process.env["DB_HOST"] ?? "127.0.0.1",
      port: parseInt(process.env["DB_PORT"] ?? "5432", 10),
      user: process.env["DB_USER"],
      password: process.env["DB_PASSWORD"],
      database: process.env["DB_NAME"] ?? "invoice_cli",
    },
    sender: {
      name: process.env["SENDER_NAME"] ?? "",
      email: process.env["SENDER_EMAIL"] ?? "",
      address: process.env["SENDER_ADDRESS"] ?? "",
      taxId: process.env["SENDER_TAX_ID"] ?? "",
    },
    defaultCurrency: (process.env["DEFAULT_CURRENCY"] ?? "USD").toUpperCase(),
    outputDir: process.env["OUTPUT_DIR"] ?? "./invoices",
  };
}
