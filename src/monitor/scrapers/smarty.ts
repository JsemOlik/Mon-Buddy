import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { fetchHtml, fetchXhr } from "./base.ts";

// URL format: https://www.smarty.cz/Some-Product-Name--{variantId}p{productId}
// The stock info endpoint only needs the numeric productId.
function extractProductId(url: string): string | null {
  const match = new URL(url).pathname.match(/p(\d+)$/);
  return match?.[1] ?? null;
}

export const smartyScraper: StockScraper = {
  storeName: "smarty",
  hostPattern: /smarty\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const productId = extractProductId(url);
    if (!productId) throw new Error(`Could not extract product ID from Smarty URL: ${url}`);

    // The StoreInfoItems endpoint is a plain HTML partial with no Cloudflare protection —
    // no EzSolver or headless browser needed.
    const stockUrl = `https://www.smarty.cz/Products/Product/StoreInfoItems?productId=${productId}&productImeiId=null&query=&latitude=null&longitude=null&inStock=false&buyoutCategoryId=null&discountPromo=&onlyShops=false`;
    const html = await fetchXhr(stockUrl, url);
    const root = parse(html);

    // Sum up stock across all locations — each in-stock row reads "Skladem celkem X ks".
    let totalStock = 0;
    for (const el of root.querySelectorAll(".storeInfo-item-status")) {
      const match = el.text.trim().match(/Skladem celkem\s+(\d+)\s*ks/i);
      if (match) totalStock += parseInt(match[1]!, 10);
    }

    const stock: ScrapeResult["stock"] = totalStock > 0 ? "in-stock" : "not-in-stock";
    const stockAmount = totalStock > 0 ? `${totalStock} ks celkem` : undefined;

    // Product page may be Cloudflare-protected — best-effort label fetch, fallback to URL slug.
    let label = url;
    try {
      const pageHtml = await fetchHtml(url);
      label = parse(pageHtml).querySelector("h1")?.text.trim() ?? url;
    } catch { /* Cloudflare blocked — caller already stores a slug-based label on first add */ }

    console.log(`[smarty] Done — stock=${stock} (${totalStock} ks total), label="${label}"`);
    return { stock, label, stockAmount };
  },
};
