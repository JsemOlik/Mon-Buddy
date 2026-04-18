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

    // Schema.org availability — most reliable signal, unaffected by related products.
    // Possible values: InStock, PreOrder, PreSale, OutOfStock, etc.
    const availHref = root
      .querySelector('link[itemprop="availability"]')
      ?.getAttribute("href")?.toLowerCase() ?? "";

    // Fallback: visible availability element (e.g. "Předprodej" shown in blue)
    const availText = root.querySelector(".Availability strong")?.text.trim().toLowerCase() ?? "";

    let stock: ScrapeResult["stock"] = "not-in-stock";
    if (availHref.includes("instock")) {
      stock = "in-stock";
    } else if (
      availHref.includes("preorder") ||
      availHref.includes("presale") ||
      availText.includes("předprodej")
    ) {
      stock = "pre-order";
    }

    // Schema.org price meta tags — clean numeric value + currency
    const priceValue = root
      .querySelector('meta[itemprop="price"]')
      ?.getAttribute("content");
    const price = priceValue ? `${priceValue} Kč` : undefined;

    // "(3\nks na skladě)" → "3 ks na skladě" / "(4+\nks v předprodeji)" → "4+ ks v předprodeji"
    const stockAmount = root
      .querySelector("em.c-mu")
      ?.text.trim()
      .replace(/[()]/g, "")
      .replace(/\s+/g, " ")
      .trim() || undefined;

    // First active carousel item = main product image
    const imageUrl = root.querySelector("figure.carousel-item.active img")?.getAttribute("src") ?? undefined;

    return { stock, label, price, stockAmount, imageUrl };
  },
};
