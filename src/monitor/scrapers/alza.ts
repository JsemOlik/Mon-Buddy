import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

const OUT_OF_STOCK_PHRASES = ["není skladem", "nedostupné", "vyprodáno"];

export const alzaScraper: StockScraper = {
  storeName: "alza",
  hostPattern: /alza\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // Availability button: "Skladem > 10 ks" or "Není skladem"
    const availBtn = root.querySelector('button[data-testid*="availabilityText"]');
    const availText = availBtn?.text.trim().toLowerCase() ?? "";
    const inStock =
      availText.length > 0 &&
      availText.includes("skladem") &&
      !OUT_OF_STOCK_PHRASES.some((p) => availText.includes(p));

    // Strip "Skladem " prefix → "> 10 ks"
    const rawAvail = availBtn?.text.trim() ?? "";
    const stockAmount = rawAvail.replace(/^skladem\s*/i, "").trim() || undefined;

    // ".ads-pb__price-value" → "149,-" → "149,- Kč"
    const priceText = root.querySelector(".ads-pb__price-value")?.text.trim();
    const price = priceText ? `${priceText} Kč` : undefined;

    return { inStock, label, price, stockAmount };
  },
};
