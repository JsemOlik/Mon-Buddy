import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";

const SOLVER_URL = process.env.SOLVER_URL ?? "http://127.0.0.1:8191";

export const jrcScraper: StockScraper = {
  storeName: "jrc",
  hostPattern: /jrc\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    console.log(`[jrc] Fetching via solver service: ${url}`);

    let html: string;
    try {
      const res = await fetch(`${SOLVER_URL}/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, wait: 15 }),
      });
      const data = await res.json() as { html?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      html = data.html!;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("Connection refused")) {
        throw new Error("JRC requires the EzSolver service — run `python ez-solver/service.py` in a separate terminal first.");
      }
      throw err;
    }

    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // In-stock: green span with "Skladem" text; amount is in the <b> child
    const inStockSpan = root.querySelector("span.color-green.toStoreInfo");
    const isInStock = !!inStockSpan;

    // Stock amount: "> 5 ks" from the <b> inside the green span
    const stockAmountRaw = inStockSpan?.querySelector("b")?.text.replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
    const stockAmount = stockAmountRaw || undefined;

    // Not released: "Připravujeme" tag present, or "Cena nebyla stanovena" price note
    const preparing =
      !!root.querySelector(".tag")?.text.includes("Připravujeme") ||
      !!root.querySelector(".color-red .toStoreInfo")?.text.includes("Připravujeme") ||
      !!root.querySelector(".font-small2.color-777")?.text.includes("Cena nebyla stanovena");

    let stock: ScrapeResult["stock"];
    if (isInStock) {
      stock = "in-stock";
    } else if (preparing) {
      stock = "not-released";
    } else {
      stock = "not-in-stock";
    }

    // Price: ".buyBox-price" — absent when not released
    const priceRaw = root.querySelector(".buyBox-price")?.text.replace(/\s+/g, " ").trim();
    const price = priceRaw || undefined;

    // Absolute image URL from the gallery
    const imageUrl = root.querySelector("img.gallery-item-img")?.getAttribute("src") ?? undefined;

    console.log(`[jrc] Done — stock=${stock}, label="${label}"`);
    return { stock, label, price, stockAmount, imageUrl };
  },
};
