import * as fs from "fs";
import * as path from "path";
import Handlebars from "handlebars";
import type { Invoice, InvoiceItem, Client } from "./db.js";
import type { AppConfig } from "./config.js";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥",
  CAD: "CA$", AUD: "A$", CHF: "CHF ", PLN: "zł ",
};

function fmt(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${num}`;
}

function nextInvoiceNumber(existing: string[]): string {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const nums = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export { nextInvoiceNumber, fmt };

export interface PdfData {
  invoice: Invoice;
  client: Client;
  items: InvoiceItem[];
  config: AppConfig;
}

export async function generatePdf(data: PdfData, outputPath: string): Promise<string> {
  const templatePath = path.join(__dirname, "..", "src", "templates", "invoice.hbs");
  // fallback: if running from dist, look relative to source root
  const resolvedPath = fs.existsSync(templatePath)
    ? templatePath
    : path.join(__dirname, "templates", "invoice.hbs");
  const templateSrc = fs.readFileSync(resolvedPath, "utf8");
  const template = Handlebars.compile(templateSrc);

  const itemsFormatted = data.items.map((item) => ({
    ...item,
    unit_price_fmt: fmt(item.unit_price, data.invoice.currency),
    total_fmt: fmt(item.total, data.invoice.currency),
  }));

  const html = template({
    sender: data.config.sender,
    invoice: data.invoice,
    client: data.client,
    items: itemsFormatted,
    subtotal_fmt: fmt(data.invoice.subtotal, data.invoice.currency),
    tax_fmt: fmt(data.invoice.tax_amount, data.invoice.currency),
    total_fmt: fmt(data.invoice.total, data.invoice.currency),
    hasTax: data.invoice.tax_rate > 0,
  });

  // Ensure output dir exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Use puppeteer to render HTML → PDF
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }

  return outputPath;
}
