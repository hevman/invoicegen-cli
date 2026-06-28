import * as path from "path";
import chalk from "chalk";
import { getDb, runMigrations, type Invoice, type InvoiceItem, type Client } from "../db.js";
import { getConfig } from "../config.js";
import { generatePdf, nextInvoiceNumber, fmt } from "../pdf.js";

export interface NewInvoiceOptions {
  client: string;
  items: string[];
  taxRate: string;
  currency?: string;
  dueIn: string;
  notes?: string;
  date?: string;
  supplyDate?: string;
  reverseCharge: boolean;
  output?: string;
  noPdf: boolean;
}

export async function newInvoice(opts: NewInvoiceOptions): Promise<void> {
  await runMigrations();
  const db = getDb();
  const config = getConfig();

  // Resolve client by ID or name
  const clientId = parseInt(opts.client, 10);
  const clientRow: Client | undefined = isNaN(clientId)
    ? await db("clients").whereRaw("LOWER(name) = LOWER(?)", [opts.client]).first()
    : await db("clients").where({ id: clientId }).first();

  if (!clientRow) {
    console.error(chalk.red(`✖  Client "${opts.client}" not found. Add with: invoice client add`));
    process.exit(1);
  }

  const currency = (opts.currency ?? clientRow.currency ?? config.defaultCurrency).toUpperCase();
  const taxRate = parseFloat(opts.taxRate) || 0;
  const date = opts.date ?? new Date().toISOString().split("T")[0]!;
  const dueIn = parseInt(opts.dueIn, 10) || 30;
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + dueIn);
  const dueDateStr = dueDate.toISOString().split("T")[0]!;

  // Parse items  "Description:qty:price"
  if (opts.items.length === 0) {
    console.error(chalk.red("✖  At least one item is required. Use: --item \"Website design:1:3500\""));
    process.exit(1);
  }

  const parsedItems: Omit<InvoiceItem, "id" | "invoice_id">[] = [];
  for (const raw of opts.items) {
    const parts = raw.split(":");
    if (parts.length < 3) {
      console.error(chalk.red(`✖  Invalid item format: "${raw}". Expected "Description:qty:price"`));
      process.exit(1);
    }
    const description = parts.slice(0, -2).join(":").trim();
    const quantity = parseFloat(parts[parts.length - 2] ?? "1");
    const unitPrice = parseFloat(parts[parts.length - 1] ?? "0");
    if (isNaN(quantity) || isNaN(unitPrice) || unitPrice <= 0) {
      console.error(chalk.red(`✖  Invalid quantity or price in: "${raw}"`));
      process.exit(1);
    }
    parsedItems.push({ description, quantity, unit_price: unitPrice, total: quantity * unitPrice });
  }

  const subtotal = parsedItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = parseFloat(((subtotal * taxRate) / 100).toFixed(2));
  const total = subtotal + taxAmount;

  // Generate invoice number
  const allNumbers: { number: string }[] = await db("invoices").select("number");
  const invoiceNumber = nextInvoiceNumber(allNumbers.map((r) => r.number));

  // Insert invoice
  const [invoiceId] = await db("invoices").insert({
    number: invoiceNumber,
    client_id: clientRow.id,
    date,
    supply_date: opts.supplyDate ?? null,
    due_date: dueDateStr,
    currency,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    status: "draft",
    notes: opts.notes ?? null,
    reverse_charge: opts.reverseCharge,
    pdf_path: null,
  } as Omit<Invoice, "id">);

  // Insert items
  for (const item of parsedItems) {
    await db("invoice_items").insert({ ...item, invoice_id: invoiceId });
  }

  // Generate PDF
  let pdfPath: string | null = null;
  if (!opts.noPdf) {
    const outputDir = config.outputDir;
    const filename = opts.output ?? `${invoiceNumber}.pdf`;
    pdfPath = path.resolve(outputDir, filename);

    const invoice = await db("invoices").where({ id: invoiceId }).first<Invoice>();
    await generatePdf(
      { invoice, client: clientRow, items: parsedItems as InvoiceItem[], config },
      pdfPath
    );
    await db("invoices").where({ id: invoiceId }).update({ pdf_path: pdfPath });
  }

  // Output
  const divider = chalk.gray("─".repeat(52));
  console.log(`\n  ✔  Invoice created\n`);
  console.log(divider);
  console.log(`  Number:    ${chalk.bold.cyan(invoiceNumber)}`);
  console.log(`  Client:    ${chalk.white(clientRow.name)}`);
  console.log(`  Date:      ${chalk.gray(date)}   Due: ${chalk.gray(dueDateStr)}`);
  console.log(`  Currency:  ${chalk.yellow(currency)}`);
  console.log();

  for (const item of parsedItems) {
    console.log(`  ${chalk.white(item.description.padEnd(30))} ${chalk.gray(`${item.quantity}x`)} ${chalk.yellow(fmt(item.unit_price, currency).padStart(10))}  =  ${chalk.yellow(fmt(item.total, currency))}`);
  }

  console.log(divider);
  console.log(`  Subtotal:  ${chalk.yellow(fmt(subtotal, currency))}`);
  if (taxRate > 0) console.log(`  Tax ${String(taxRate).padEnd(6)} ${chalk.yellow(fmt(taxAmount, currency))}`);
  console.log(`  ${chalk.bold("Total:")}     ${chalk.bold.green(fmt(total, currency))}`);
  console.log(divider);

  if (pdfPath) {
    console.log(`\n  📄  PDF: ${chalk.cyan(pdfPath)}\n`);
  }
}

export async function listInvoices(opts: { status?: string; client?: string; limit: string }): Promise<void> {
  await runMigrations();
  const db = getDb();

  let query = db("invoices")
    .join("clients", "invoices.client_id", "clients.id")
    .select("invoices.*", "clients.name as client_name")
    .orderBy("invoices.date", "desc")
    .limit(parseInt(opts.limit, 10) || 20);

  if (opts.status) query = query.where("invoices.status", opts.status);
  if (opts.client) query = query.whereRaw("LOWER(clients.name) LIKE LOWER(?)", [`%${opts.client}%`]);

  const rows: (Invoice & { client_name: string })[] = await query;

  if (rows.length === 0) {
    console.log(chalk.gray("\n  No invoices found.\n"));
    return;
  }

  const statusColor = (s: string) => {
    if (s === "paid")    return chalk.green(s.padEnd(8));
    if (s === "overdue") return chalk.red(s.padEnd(8));
    if (s === "sent")    return chalk.blue(s.padEnd(8));
    return chalk.gray(s.padEnd(8));
  };

  const divider = chalk.gray("─".repeat(80));
  console.log("\n" + divider);
  console.log(
    chalk.bold("  Number           ") +
    chalk.bold("Client               ") +
    chalk.bold("Date        ") +
    chalk.bold("Status    ") +
    chalk.bold("Total")
  );
  console.log(divider);

  for (const r of rows) {
    console.log(
      `  ${chalk.cyan(r.number.padEnd(18))}` +
      r.client_name.padEnd(22) +
      chalk.gray(r.date.padEnd(13)) +
      statusColor(r.status) +
      chalk.yellow(fmt(Number(r.total), r.currency))
    );
  }

  console.log(divider + "\n");
}

export async function markInvoice(number: string, status: Invoice["status"]): Promise<void> {
  await runMigrations();
  const db = getDb();

  const invoice = await db("invoices").where({ number }).first<Invoice>();
  if (!invoice) {
    console.error(chalk.red(`✖  Invoice "${number}" not found.`));
    process.exit(1);
  }

  await db("invoices").where({ number }).update({ status });
  console.log(`\n  ✔  Invoice ${chalk.cyan(number)} marked as ${chalk.bold(status)}\n`);
}
