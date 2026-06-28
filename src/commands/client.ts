import chalk from "chalk";
import { getDb, runMigrations, type Client } from "../db.js";

export interface ClientAddOptions {
  name: string;
  email?: string;
  address?: string;
  taxId?: string;
  vatNumber?: string;
  currency: string;
}

export async function addClient(opts: ClientAddOptions): Promise<void> {
  await runMigrations();
  const db = getDb();

  const existing = await db("clients").whereRaw("LOWER(name) = LOWER(?)", [opts.name]).first<Client>();
  if (existing) {
    console.error(chalk.red(`✖  Client "${opts.name}" already exists (ID: ${existing.id}).`));
    process.exit(1);
  }

  const [id] = await db("clients").insert({
    name: opts.name,
    email: opts.email ?? null,
    address: opts.address ?? null,
    tax_id: opts.taxId ?? null,
    vat_number: opts.vatNumber ?? null,
    currency: opts.currency.toUpperCase(),
  });

  console.log(
    `\n  ✔  Client added  ${chalk.gray(`#${id}`)}\n` +
    `     Name:       ${chalk.cyan(opts.name)}\n` +
    (opts.email     ? `     Email:      ${chalk.gray(opts.email)}\n` : "") +
    (opts.address   ? `     Address:    ${chalk.gray(opts.address)}\n` : "") +
    (opts.taxId     ? `     Tax ID:     ${chalk.gray(opts.taxId)}\n` : "") +
    (opts.vatNumber ? `     VAT No:     ${chalk.gray(opts.vatNumber)}\n` : "") +
    `     Currency:   ${chalk.yellow(opts.currency.toUpperCase())}\n`
  );
}

export async function listClients(): Promise<void> {
  await runMigrations();
  const db = getDb();

  const clients = await db("clients")
    .leftJoin("invoices", "clients.id", "invoices.client_id")
    .groupBy("clients.id")
    .select("clients.*")
    .count({ invoice_count: "invoices.id" })
    .orderBy("clients.name") as (Client & { invoice_count: number | string })[];

  if (clients.length === 0) {
    console.log(chalk.gray("\n  No clients yet. Add one with: invoice client add\n"));
    return;
  }

  const divider = chalk.gray("─".repeat(72));
  console.log("\n" + divider);
  console.log(
    chalk.bold("  ID   ") +
    chalk.bold("Name                 ") +
    chalk.bold("Email                    ") +
    chalk.bold("Currency  ") +
    chalk.bold("Invoices")
  );
  console.log(divider);

  for (const c of clients) {
    console.log(
      `  ${chalk.gray(String(c.id ?? "").padEnd(5))}` +
      chalk.cyan(c.name.padEnd(22)) +
      chalk.gray((c.email ?? "—").padEnd(26)) +
      chalk.yellow(c.currency.padEnd(10)) +
      chalk.white(String(c.invoice_count))
    );
  }

  console.log(divider + "\n");
}
