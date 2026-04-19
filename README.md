# Mon Buddy

A Discord bot that monitors Czech Pokémon card stores for restocks and notifies a configured channel when a product comes back in stock. Includes a Next.js web dashboard for managing monitors without needing to type slash commands.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Discord Users                            │
│              (slash commands / restock alerts)                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Discord API (discord.js)
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                      Discord Bot (Bun)                        │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Commands   │  │   Poller     │  │   REST API (:4040)   │  │
│  │  /monitor   │  │  every 30s   │  │  X-API-Key auth      │  │
│  │  /help      │  │  per-product │  │  CRUD + guild info   │  │
│  │  /ping      │  │  rate limits │  └──────────┬───────────┘  │
│  └─────────────┘  └──────┬───────┘             │              │
│                          │                     │              │
│           ┌──────────────▼──────────────────┐  │              │
│           │          Scrapers               │  │              │
│           │  hrananetu · cardstore · cdmc   │  │              │
│           │  xzone  ──── direct fetch ────  │  │              │
│           │  alza · smarty ── EzSolver ──┐  │  │              │
│           └──────────────────────────────┼──┘  │              │
│                                          │     │              │
│  ┌──────────────────────────────────┐    │     │              │
│  │   Database (SQLite / PostgreSQL) │    │     │              │
│  │   monitored_products             │    │     │              │
│  │   config  ·  stock_events        │    │     │              │
│  └──────────────────────────────────┘    │     │              │
└──────────────────────────────────────────┼─────┼──────────────┘
                                           │     │
          ┌────────────────────────────────▼─┐   │
          │     EzSolver (Python + nodriver) │   │
          │     Headless Chromium, port 8191 │   │
          │     Bypasses anti-bot pages      │   │
          └──────────────────────────────────┘   │
                                                 │
┌────────────────────────────────────────────────▼─────────────┐
│              Web Dashboard (Next.js on Vercel)               │
│                                                              │
│  Discord OAuth (NextAuth v5)                                 │
│  ├─ Shows servers where user has Manage Server permission    │
│  ├─ Add / remove product monitors per server                 │
│  └─ Set the alert channel per server                         │
└──────────────────────────────────────────────────────────────┘
```

---

## Components

### Bot (`/` root — Bun)
The core Discord bot. On startup it initialises the database, registers slash command handlers, starts the product poller, and exposes the internal REST API.

- **Commands** (`src/commands/`) — `/monitor add|list|remove|check`, `/help`, `/ping`. All monitor commands require **Manage Server** permission.
- **Poller** (`src/monitor/poller.ts`) — runs every 30 s. Checks each product through its scraper and fires a Discord embed alert on orderable stock transitions (see [Alert conditions](#alert-conditions)).
- **Scrapers** (`src/monitor/scrapers/`) — one scraper per store, matched by hostname. Most stores are plain `fetch` + HTML parse. Alza and Smarty route through EzSolver to bypass Cloudflare.
- **Browser / CDP** (`src/monitor/browser.ts`, `src/monitor/cdp.ts`) — spawns a single persistent Chromium process via Bun and communicates with it over the Chrome DevTools Protocol using Bun's native WebSocket (Playwright's WebSocket layer is incompatible with Bun).
- **REST API** (`src/api/server.ts`) — Bun HTTP server on port 4040. Used exclusively by the web dashboard. Protected by `X-API-Key`.

### EzSolver (`ez-solver/`)
A small Python service that launches a real Chromium browser (via `nodriver`) and returns rendered HTML for a given URL. Required only for Alza and Smarty, which serve Cloudflare-protected pages that block plain `fetch`.

Runs as a separate process/container. The bot talks to it via `POST /fetch`.

### Web Dashboard (`web/` — Next.js + Vercel)
A Next.js 16 app deployed to Vercel. Users sign in with Discord OAuth (NextAuth v5). The UI shows servers the user can manage, and lets them add/remove monitors and pick an alert channel — all by calling the bot's REST API.

### Database
Dual-mode: **SQLite** (local dev, `mon-buddy.db`) or **PostgreSQL** (production, set `DATABASE_URL=postgres://...`). Switched automatically at startup based on the `DATABASE_URL` env var.

---

## Alert Conditions

An alert is sent **only when the stock status actually changes** into an orderable state. Repeated checks in the same state produce no noise.

| Transition | Alert sent |
|---|---|
| anything → `in-stock` | ✅ In-stock alert |
| `not-in-stock` / `not-released` → `pre-order` | 🔵 Pre-order alert |
| `not-released` → `not-in-stock` | ❌ No alert |
| anything → `not-in-stock` / `not-released` | ❌ No alert |
| `in-stock` → `pre-order` | ❌ No alert (downgrade) |

Stock statuses: **`in-stock`** · **`pre-order`** · **`not-in-stock`** · **`not-released`** (price is 0 and item unavailable — only used by Veselý Drak).

---

## Supported Stores

| Store | Domain | Method |
|---|---|---|
| HraNaNetu | hrananetu.cz | Direct fetch |
| CardStore | cardstore.cz | Direct fetch |
| CDMC | cdmc.cz | Direct fetch |
| Xzone | xzone.cz | Direct fetch |
| Veselý Drak | vesely-drak.cz | Direct fetch |
| Chaotit | chaotit.cz | Direct fetch |
| Alza | alza.cz | EzSolver (Cloudflare bypass) |
| Smarty | smarty.cz | EzSolver (Cloudflare bypass) |

---

## Setup

### Bot

```bash
# Install dependencies
bun install

# Copy and fill in env vars
cp .env.example .env

# Deploy slash commands to Discord (run once, or after command changes)
bun run src/deploy-commands.ts

# Start the bot
bun run index.ts
```

### EzSolver (required for Alza / Smarty)

```bash
cd ez-solver
pip install -r requirements.txt
python service.py
```

### Web Dashboard

```bash
cd web
bun install
# Set AUTH_SECRET, AUTH_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, BOT_API_URL, BOT_API_KEY in web/.env
bun run dev
```

---

## Environment Variables

### Bot (`.env`)

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID (for command deployment) |
| `DATABASE_URL` | Postgres connection string, or omit for SQLite |
| `API_SECRET_KEY` | Shared secret between bot API and web dashboard |
| `WEB_ORIGIN` | Allowed CORS origin for the web dashboard |
| `SOLVER_URL` | EzSolver base URL (default: `http://127.0.0.1:8191`) |
| `API_PORT` | Bot REST API port (default: `4040`) |
| `CHROMIUM_VISIBLE` | Set to `1` to show the browser window (for CAPTCHA solving) |

### Web (`web/.env`)

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Random secret for NextAuth JWT signing |
| `AUTH_URL` | Full URL of the web app (e.g. `https://mon-buddy-web.vercel.app`) |
| `DISCORD_CLIENT_ID` | Discord OAuth app client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth app client secret |
| `BOT_API_URL` | URL of the bot REST API |
| `BOT_API_KEY` | Must match `API_SECRET_KEY` on the bot |

---

## Docker

```bash
# Build and start all services (bot + ez-solver + postgres)
docker compose up -d

# Build and push images to GHCR (GitHub Actions)
# Trigger the "Build & Push Docker Images" workflow in the Actions tab
```

Images:
- `ghcr.io/jsemolik/mon-buddy-bot:latest`
- `ghcr.io/jsemolik/mon-buddy-solver:latest`

---

## Adding a New Store

### Option A — Direct fetch (plain HTML scraping)

Use this for stores that serve normal HTML to `fetch` with no bot-protection.

**1. Create the scraper** — `src/monitor/scrapers/mystore.ts`

```typescript
import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

export const mystoreScraper: StockScraper = {
  storeName: "mystore",           // lowercase, no spaces — used as the DB key
  hostPattern: /mystore\.cz$/,    // matched against URL hostname

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // Determine stock status — inspect the store's HTML to find the right selector
    const inStock = !!root.querySelector(".some-in-stock-indicator");
    const stock: ScrapeResult["stock"] = inStock ? "in-stock" : "not-in-stock";
    // Use "pre-order" or "not-released" where applicable

    const price = root.querySelector(".price")?.text.trim().replace(/\s+/g, " ");
    const stockAmount = root.querySelector(".stock-qty")?.text.trim();

    // Prepend origin if the src is a relative path
    const imageSrc = root.querySelector("img.product-image")?.getAttribute("src");
    const imageUrl = imageSrc
      ? (imageSrc.startsWith("http") ? imageSrc : `https://www.mystore.cz${imageSrc}`)
      : undefined;

    return { stock, label, price, stockAmount, imageUrl };
  },
};
```

**2. Register the scraper** — `src/monitor/scrapers/index.ts`

```typescript
import { mystoreScraper } from "./mystore.ts";
const registry: StockScraper[] = [...existingScrapers, mystoreScraper];
```

**3. Add display name & embed colour** — `src/monitor/alert.ts`

```typescript
storeDisplayNames["mystore"] = "MyStore.cz";
storeColors["mystore"] = 0xRRGGBB;
```

**4. Add to the website** — `web/app/page.tsx` (STORES array) and `web/components/footer.tsx` (STORE_LINKS), then drop a logo into `web/public/`.

---

### Option B — EzSolver / Chromium (Cloudflare-protected stores)

Use this when plain `fetch` returns a 403 or a Cloudflare challenge page.

**1. Create the scraper** — same structure as Option A, but use `fetchViaSolver` instead of `fetchHtml`:

```typescript
import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://127.0.0.1:8191";

async function fetchViaSolver(url: string): Promise<string> {
  const res = await fetch(`${SOLVER_URL}/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`EzSolver HTTP ${res.status}`);
  const { html } = await res.json() as { html: string };
  return html;
}

export const mystoreScraper: StockScraper = {
  storeName: "mystore",
  hostPattern: /mystore\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchViaSolver(url);
    const root = parse(html);
    // ... same parsing logic as Option A
  },
};
```

**2. Add the store to `SLOW_STORES`** in `src/monitor/poller.ts` so it is polled every 2 minutes instead of 30 seconds (Chromium is slower and heavier):

```typescript
const SLOW_STORES = new Set(["alza", "smarty", "mystore"]);
```

**3. Steps 2–4 are identical to Option A.**

---

### Stock statuses reference

| Value | Meaning |
|---|---|
| `in-stock` | Item can be purchased now |
| `pre-order` | Item can be pre-ordered |
| `not-in-stock` | Item exists but is currently sold out |
| `not-released` | Item has not been released yet (typically price = 0 or 1 Kč) |
