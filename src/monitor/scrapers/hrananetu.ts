import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

export const hrananetuScraper: StockScraper = {
  storeName: "hrananetu",
  hostPattern: /hrananetu\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // In-stock signals:
    //   <abbr ...>..Skladem</abbr>  — primary indicator
    //   "(X ks na skladě)"          — secondary indicator
    const bodyText = root.text.toLowerCase();
    const hasNeni = bodyText.includes("není skladem") || bodyText.includes("vyprodáno");
    const hasSkladem =
      bodyText.includes("skladem") ||
      bodyText.includes("na skladě");
    const inStock = hasSkladem && !hasNeni;

    // Price: look for text containing "Kč"
    const priceEl = root.querySelector("strong, .price, [class*='price']");
    const price = priceEl?.text.includes("Kč") ? priceEl.text.trim() : undefined;

    return { inStock, label, price };
  },
};
