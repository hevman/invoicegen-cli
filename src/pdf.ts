import * as fs from "fs";
import * as path from "path";
import Handlebars from "handlebars";
import type { Invoice, InvoiceItem, Client } from "./db.js";
import type { AppConfig } from "./config.js";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", JPY: "¥",
  CAD: "CA$", AUD: "A$", CHF: "CHF ", PLN: "zł ",
};

export function fmt(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  const num = amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol}${num}`;
}

export function nextInvoiceNumber(existing: string[]): string {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const nums = existing
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export interface PdfData {
  invoice: Invoice;
  client: Client;
  items: InvoiceItem[];
  config: AppConfig;
}

/**
 * Resolve the path to a Chrome/Chromium executable.
 * Priority:
 *   1. CHROME_PATH env variable (user-supplied)
 *   2. Common system Chrome/Chromium paths (Windows, macOS, Linux)
 *   3. Puppeteer's bundled Chromium (fallback)
 */
function findChromePath(): string | undefined {
  // 1. Explicit env override
  if (process.env["CHROME_PATH"]) return process.env["CHROME_PATH"];

  const candidates: string[] = [];

  if (process.platform === "win32") {
    const programFiles = [
      process.env["PROGRAMFILES"],
      process.env["PROGRAMFILES(X86)"],
      process.env["LOCALAPPDATA"],
    ].filter(Boolean) as string[];

    for (const base of programFiles) {
      candidates.push(
        path.join(base, "Google", "Chrome", "Application", "chrome.exe"),
        path.join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
        path.join(base, "Chromium", "Application", "chrome.exe"),
      );
    }
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    );
  } else {
    // Linux
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
      "/usr/bin/microsoft-edge",
    );
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return undefined; // let puppeteer use its bundled Chromium
}

export async function generatePdf(data: PdfData, outputPath: string): Promise<string> {
  // Resolve template — works from both src/ (ts-node) and dist/ (compiled)
  const templatePath = path.join(__dirname, "templates", "invoice.hbs");
  const fallbackPath = path.join(__dirname, "..", "src", "templates", "invoice.hbs");
  const resolvedPath = fs.existsSync(templatePath) ? templatePath : fallbackPath;

  const templateSrc = fs.readFileSync(resolvedPath, "utf8");
  const template = Handlebars.compile(templateSrc);

  const itemsFormatted = data.items.map((item) => ({
    ...item,
    unit_price_fmt: fmt(item.unit_price, data.invoice.currency),
    total_fmt: fmt(item.total, data.invoice.currency),
  }));

  const html = template({
    sender: {
      ...data.config.sender,
      vatNumber: data.config.sender.vatNumber,
    },
    invoice: data.invoice,
    client: data.client,
    items: itemsFormatted,
    subtotal_fmt: fmt(data.invoice.subtotal, data.invoice.currency),
    tax_fmt: fmt(data.invoice.tax_amount, data.invoice.currency),
    total_fmt: fmt(data.invoice.total, data.invoice.currency),
    hasTax: data.invoice.tax_rate > 0 && !data.invoice.reverse_charge,
  });

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const puppeteer = await import("puppeteer");

  const executablePath = findChromePath();
  const launchOptions: Parameters<typeof puppeteer.default.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    ...(executablePath ? { executablePath } : {}),
  };

  if (executablePath) {
    console.log(`  🌐  Using Chrome: ${executablePath}`);
  }

  const browser = await puppeteer.default.launch(launchOptions);
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
