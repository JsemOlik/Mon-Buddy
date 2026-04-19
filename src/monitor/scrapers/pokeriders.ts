import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

export const pokeridersScraper: StockScraper = {
  storeName: "pokeriders",
  hostPattern: /pokeriders\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // Schema.org availability — most reliable signal
    const availHref = root.querySelector('link[itemprop="availability"]')?.getAttribute("href") ?? "";
    const schemaInStock = availHref.toLowerCase().includes("instock");

    // Schema.org price content — "1.00" means not yet released
    const priceContent = root.querySelector('meta[itemprop="price"]')?.getAttribute("content") ?? "";
    const priceValue = parseFloat(priceContent);

    // Availability label text e.g. "Skladem (1 ks)" or "Momentálně nedostupné"
    const availText = root.querySelector('span[data-testid="labelAvailability"]')?.text.trim() ?? "";

    // Stock amount is in its own element: "(1 ks)" → "1 ks"
    const stockAmountRaw = root.querySelector('span[data-testid="numberAvailabilityAmount"]')?.text.trim().replace(/[()]/g, "").trim();
    const stockAmount = stockAmountRaw || undefined;

    // Price display — strip extra whitespace/newlines from the price element
    const priceRaw = root.querySelector('strong[data-testid="productCardPrice"]')?.text.replace(/\s+/g, " ").trim() ?? "";
    const price = priceRaw || undefined;

    let stock: ScrapeResult["stock"];
    if (schemaInStock || availText.toLowerCase().includes("skladem")) {
      stock = "in-stock";
    } else {
      // Unavailable + price 1 Kč = not yet released; valid price = sold out
      stock = priceValue === 1 ? "not-released" : "not-in-stock";
    }

    // Absolute CDN image URL from the gallery anchor
    const imageUrl =
      root.querySelector('a#gallery-image img')?.getAttribute("src") ??
      root.querySelector('img[data-testid="mainImage"]')?.getAttribute("src") ??
      undefined;

    return { stock, label, price, stockAmount, imageUrl };
  },
};
