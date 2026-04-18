import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

const OUT_OF_STOCK_PHRASES = ["není skladem", "vyprodáno", "nedostupné"];

export const cdmcScraper: StockScraper = {
  storeName: "cdmc",
  hostPattern: /cdmc\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    const availText = root
      .querySelector('[data-testid="labelAvailability"]')
      ?.text.trim().toLowerCase() ?? "";

    const inStock =
      availText.length > 0 &&
      !OUT_OF_STOCK_PHRASES.some((p) => availText.includes(p));
    const stock: ScrapeResult["stock"] = inStock ? "in-stock" : "not-in-stock";

    // Stock amount — innermost span holds the clean value, e.g. ">15 ks"
    const stockAmount = root
      .querySelector(".product-stock-amount")
      ?.text.trim()
      .replace(/\s+/g, " ") || undefined;

    // Final (discounted) price
    const priceText = root
      .querySelector('[data-testid="productCardPrice"] .price-final-holder')
      ?.text.trim()
      .replace(/\s+/g, " ");

    const imageUrl = root.querySelector("a.p-main-image img")?.getAttribute("src") ?? undefined;

    return { stock, label, price: priceText, stockAmount, imageUrl };
  },
};
