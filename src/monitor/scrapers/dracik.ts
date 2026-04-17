import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

export const dracikScraper: StockScraper = {
  storeName: "dracik",
  hostPattern: /dracik\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label =
      root.querySelector("h1.product-title, h1[itemprop='name'], h1")?.text.trim() ?? url;

    // "Skladem" = in stock; "Není skladem" / "Vyprodáno" = out of stock
    const availEl = root.querySelector(
      ".availability, .product-stock, .stock-status, [class*='availability']"
    );
    const availText = availEl?.text.toLowerCase() ?? "";
    const inStock = availText.includes("skladem") && !availText.includes("není");

    const price =
      root.querySelector(".price, [itemprop='price'], .product-price")?.text.trim();

    return { inStock, label, price };
  },
};
