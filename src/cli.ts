#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { closeDb } from "./db.js";
import { addClient, listClients } from "./commands/client.js";
import { newInvoice, listInvoices, markInvoice } from "./commands/invoice.js";

const program = new Command();

program
  .name("invoice")
  .description(
    "Professional invoice generator CLI.\n" +
    "Supports SQLite, PostgreSQL, MySQL and MSSQL.\n" +
    "Configure via .env file (see .env.example)."
  )
  .version("1.0.0");

// ── invoice client ─────────────────────────────────────────────────────────
const clientCmd = program.command("client").description("Manage clients");

clientCmd
  .command("add")
  .description("Add a new client")
  .requiredOption("-n, --name <name>", "Client name")
  .option("-e, --email <email>", "Client email")
  .option("-a, --address <address>", "Client address")
  .option("--tax-id <id>", "Client tax ID / VAT number")
  .option("--currency <code>", "Default currency for this client", "USD")
  .action(async (opts) => {
    await addClient({ name: opts.name, email: opts.email, address: opts.address, taxId: opts.taxId, currency: opts.currency });
    await closeDb();
  });

clientCmd
  .command("list")
  .description("List all clients")
  .action(async () => {
    await listClients();
    await closeDb();
  });

// ── invoice new ────────────────────────────────────────────────────────────
program
  .command("new")
  .description("Create a new invoice and generate PDF")
  .requiredOption("-c, --client <name|id>", "Client name or ID")
  .requiredOption("-i, --item <desc:qty:price>", "Line item — can be used multiple times", (v, a: string[]) => [...a, v], [] as string[])
  .option("--tax <rate>", "Tax / VAT rate in percent (e.g. 23 for 23%)", "0")
  .option("--currency <code>", "Currency (overrides client default)")
  .option("--due-in <days>", "Payment due in N days", "30")
  .option("--notes <text>", "Notes printed on invoice")
  .option("--date <YYYY-MM-DD>", "Invoice date (defaults to today)")
  .option("-o, --output <filename>", "PDF output filename")
  .option("--no-pdf", "Skip PDF generation, save to DB only")
  .action(async (opts) => {
    await newInvoice({
      client: opts.client,
      items: opts.item,
      taxRate: opts.tax,
      currency: opts.currency,
      dueIn: opts.dueIn,
      notes: opts.notes,
      date: opts.date,
      output: opts.output,
      noPdf: !opts.pdf,
    });
    await closeDb();
  });

// ── invoice list ───────────────────────────────────────────────────────────
program
  .command("list")
  .description("List invoices")
  .option("-s, --status <status>", "Filter by status: draft, sent, paid, overdue")
  .option("-c, --client <name>", "Filter by client name")
  .option("-l, --limit <number>", "Max rows", "20")
  .action(async (opts) => {
    await listInvoices(opts);
    await closeDb();
  });

// ── invoice mark ───────────────────────────────────────────────────────────
program
  .command("mark <number> <status>")
  .description("Update invoice status (draft | sent | paid | overdue)")
  .action(async (number: string, status: string) => {
    const valid = ["draft", "sent", "paid", "overdue"];
    if (!valid.includes(status)) {
      console.error(chalk.red(`✖  Status must be one of: ${valid.join(", ")}`));
      process.exit(1);
    }
    await markInvoice(number, status as "draft" | "sent" | "paid" | "overdue");
    await closeDb();
  });

// ── invoice db-info ────────────────────────────────────────────────────────
program
  .command("db-info")
  .description("Show current database configuration")
  .action(async () => {
    const { getConfig } = await import("./config.js");
    const cfg = getConfig();
    console.log("\n  🗄️   Database\n");
    console.log(`  Client:    ${chalk.cyan(cfg.db.client)}`);
    if (cfg.db.client === "sqlite") {
      console.log(`  File:      ${chalk.gray(cfg.db.filename ?? "./invoice.db")}`);
    } else {
      console.log(`  Host:      ${chalk.gray(cfg.db.host)}:${chalk.gray(String(cfg.db.port))}`);
      console.log(`  Database:  ${chalk.gray(cfg.db.database)}`);
    }
    console.log(`\n  📤  Sender: ${chalk.white(cfg.sender.name || chalk.gray("(not set — configure in .env)"))}`);
    console.log(`  📁  Output: ${chalk.gray(cfg.outputDir)}\n`);
    await closeDb();
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(chalk.red(`\n✖  ${err.message}\n`));
  process.exit(1);
});
