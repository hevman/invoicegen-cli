# invoicegen-cli

A command-line invoice generator for freelancers and small businesses. Create professional PDF invoices, manage clients, and track payment status — all from your terminal.

No subscription. No signup. Fully open source.

```
$ invoice new --client "Acme Corp" \
    --item "Website redesign:1:3500" \
    --item "SEO setup:3:250" \
    --tax 0 --due-in 30

  ✔  Invoice created

  ──────────────────────────────────────────────────────
  Number:    INV-2026-001
  Client:    Acme Corp
  Date:      2026-06-28   Due: 2026-07-28
  Currency:  USD

  Website redesign               1x  $3,500.00  =  $3,500.00
  SEO setup                      3x    $250.00  =    $750.00
  ──────────────────────────────────────────────────────
  Subtotal:  $4,250.00
  Total:     $4,250.00
  ──────────────────────────────────────────────────────

  📄  PDF: ./invoices/INV-2026-001.pdf
```

## Features

- **PDF generation** — clean, professional invoice template rendered via headless Chrome
- **Client management** — save clients and reuse them across invoices
- **Auto-numbering** — invoices automatically numbered (INV-2026-001, INV-2026-002, ...)
- **VAT / Tax support** — set tax rate per invoice, automatically calculated
- **Multi-currency** — USD, EUR, GBP, JPY and any ISO 4217 code with correct symbols
- **Status tracking** — draft → sent → paid / overdue
- **Multiple databases** — SQLite (zero config), PostgreSQL, MySQL, MSSQL
- **Zero config to start** — works out of the box with SQLite

## Supported databases

| Database    | `DB_CLIENT` value |
|-------------|-------------------|
| SQLite      | `sqlite`          |
| PostgreSQL  | `postgresql`      |
| MySQL       | `mysql`           |
| MSSQL       | `mssql`           |

## Installation

```bash
npm install -g invoicegen-cli
```

> **Requirements:** Node.js >= 18. Puppeteer (included) downloads Chromium on first install (~170MB).

## Quick start

```bash
# 1. Configure your sender details (optional but recommended)
cp .env.example .env
# Edit .env with your name, email, address

# 2. Add a client
invoice client add --name "Acme Corp" --email "billing@acme.com" --currency USD

# 3. Create an invoice
invoice new --client "Acme Corp" \
  --item "Consulting:10:150" \
  --item "Code review:2:200" \
  --tax 0 \
  --due-in 30

# 4. Mark as sent when you email it
invoice mark INV-2026-001 sent

# 5. Mark as paid when money arrives
invoice mark INV-2026-001 paid
```

## Configuration

Copy `.env.example` to `.env`:

```env
DB_CLIENT=sqlite
DB_FILENAME=./invoice.db

SENDER_NAME=John Smith
SENDER_EMAIL=john@example.com
SENDER_ADDRESS=456 Oak Ave, San Francisco, CA 94102
SENDER_TAX_ID=                  # optional

DEFAULT_CURRENCY=USD
OUTPUT_DIR=./invoices
```

For PostgreSQL / MySQL / MSSQL:

```env
DB_CLIENT=postgresql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=invoice_user
DB_PASSWORD=secret
DB_NAME=invoice_cli
```

## Commands

### Clients

```bash
# Add a client
invoice client add --name "Client Name" --email "e@mail.com" --address "..." --currency USD

# List all clients
invoice client list
```

### Invoices

```bash
# Create invoice (--item can be repeated)
invoice new \
  --client "Client Name or ID" \
  --item "Description:quantity:unit_price" \
  --item "Another item:2:500" \
  --tax 23 \
  --currency EUR \
  --due-in 14 \
  --notes "Optional notes printed on invoice"

# List invoices
invoice list
invoice list --status paid
invoice list --client "Acme"

# Update status
invoice mark INV-2026-001 sent
invoice mark INV-2026-001 paid
invoice mark INV-2026-001 overdue
```

### Other

```bash
# Show DB and sender configuration
invoice db-info

# Help
invoice --help
invoice new --help
```

## Item format

Items use colon-separated format: `"Description:quantity:unit_price"`

```bash
--item "Logo design:1:800"          # 1 × $800 = $800
--item "Hourly consulting:8:120"    # 8 × $120 = $960
--item "Monthly retainer:1:2000"    # 1 × $2000 = $2000
```

## License

MIT
