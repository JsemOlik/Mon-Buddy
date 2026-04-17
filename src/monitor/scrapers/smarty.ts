import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml } from "./base.ts";

function extractProductId(url: string): string | null {
  const match = new URL(url).pathname.match(/4p(\d+)/i);
  return match?.[1] ?? null;
}

function labelFromUrl(url: string): string {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
  return slug
    .replace(/--4p\d+$/i, "")   // strip --4p12345 suffix
    .replace(/-4p\d+$/i, "")    // strip -4p12345 suffix (single dash variant)
    .replace(/-+/g, " ")         // dashes → spaces
    .trim();
}

export const smartyScraper: StockScraper = {
  storeName: "smarty",
  hostPattern: /smarty\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const productId = extractProductId(url);
    if (!productId) throw new Error(`Cannot extract product ID from Smarty URL: ${url}`);

    const stockUrl =
      `https://www.smarty.cz/Products/Product/StoreInfoItems` +
      `?productId=${productId}&productImeiId=null&query=&latitude=null` +
      `&longitude=null&inStock=false&buyoutCategoryId=null&discountPromo=&onlyShops=false`;

    const html = await fetchHtml(stockUrl, url);
    const root = parse(html);

    // Strip "není skladem" entries so the remaining "skladem" matches are true in-stock hits
    const cleaned = root.text.toLowerCase().replace(/není\s+skladem/g, "");
    const inStock = cleaned.includes("skladem");

    return {
      inStock,
      label: labelFromUrl(url),
    };
  },
};
