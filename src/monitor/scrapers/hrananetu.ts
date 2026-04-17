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

    // Target the specific <abbr data-toggle="tooltip"> element that carries the
    // per-product stock status. Related products further down the page can also
    // contain "Není skladem" which breaks a full-page text scan.
    const abbrs = root.querySelectorAll('abbr[data-toggle="tooltip"]');
    const stockAbbr = abbrs.find((el) => {
      const t = el.text.toLowerCase();
      return t.includes("skladem") || t.includes("na skladě");
    });
    const inStock =
      stockAbbr !== undefined &&
      !stockAbbr.text.toLowerCase().includes("není");

    // Price: look for text containing "Kč"
    const priceEl = root.querySelector("strong, .price, [class*='price']");
    const price = priceEl?.text.includes("Kč") ? priceEl.text.trim() : undefined;

    return { inStock, label, price };
  },
};
