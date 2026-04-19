import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

export const veselydrakScraper: StockScraper = {
  storeName: "veselydrak",
  hostPattern: /vesely-drak\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const html = await fetchHtml(url);
    const root = parse(html);

    const label = root.querySelector("h1")?.text.trim() ?? url;

    // Green span = in-stock text like "Skladem: > 10 ks"
    // Red span = not available text like "Na eshopu nemáme dostupné"
    const greenSpan = root.querySelector("span.text-green");
    const redSpan = root.querySelector("span.text-red");

    let stock: ScrapeResult["stock"] = "not-in-stock";
    let stockAmount: string | undefined;

    if (greenSpan) {
      const text = greenSpan.text.trim();
      if (text.toLowerCase().includes("předprodej") || text.toLowerCase().includes("předobjednávka")) {
        stock = "pre-order";
      } else {
        stock = "in-stock";
      }
      stockAmount = text;
    } else if (redSpan) {
      stock = "not-in-stock";
    }

    const priceRaw = root.querySelector(".price-box .price, .product-price, #product-price")?.text.trim();
    const price = priceRaw ? priceRaw.replace(/\s+/g, " ") : undefined;

    const imageUrl =
      root.querySelector('.product-image img, .gallery-main img, #product-image')?.getAttribute("src") ??
      root.querySelector('img[itemprop="image"]')?.getAttribute("src") ??
      undefined;

    return { stock, label, price, stockAmount, imageUrl };
  },
};
