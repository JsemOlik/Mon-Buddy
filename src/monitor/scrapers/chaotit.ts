import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

export const chaotitScraper: StockScraper = {
  storeName: "chaotit",
  hostPattern: /chaotit\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // Schema.org availability is the most reliable signal
    const availHref = root.querySelector('link[itemprop="availability"]')?.getAttribute("href") ?? "";
    const schemaInStock = availHref.toLowerCase().includes("instock");

    // "Položka byla vyprodána…" only present when truly sold out (not when unreleased)
    const soldOut = !!root.querySelector(".sold-out-wrapper");

    // Price: "339 Kč" — strip whitespace and newlines
    const priceRaw = root.querySelector(".price-final-holder")?.text.replace(/\s+/g, " ").trim() ?? "";
    const priceValue = parseInt(priceRaw.replace(/\D/g, ""), 10);
    const price = priceRaw || undefined;

    // Stock amount: "(>5 ks)" → ">5 ks"
    const stockAmountRaw = root.querySelector(".availability-amount")?.text.trim().replace(/[()]/g, "").replace(/&gt;/g, ">").trim();
    const stockAmount = stockAmountRaw || undefined;

    let stock: ScrapeResult["stock"];
    if (schemaInStock) {
      stock = "in-stock";
    } else if (soldOut) {
      stock = "not-in-stock";
    } else {
      // Unavailable without sold-out banner: price 1 Kč = not yet released
      stock = priceValue === 1 ? "not-released" : "not-in-stock";
    }

    // Main product image from CDN
    const imageUrl = root.querySelector('img[fetchpriority="high"]')?.getAttribute("src") ?? undefined;

    return { stock, label, price, stockAmount, imageUrl };
  },
};
