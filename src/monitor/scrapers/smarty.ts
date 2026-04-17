import { ProxyAgent, fetch as proxyFetch } from "undici";
import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";

// One agent per token value; reused across poll cycles
let _agentCache: { token: string; agent: ProxyAgent } | null = null;

function getAgent(token: string): ProxyAgent {
  if (_agentCache?.token !== token) {
    _agentCache = {
      token,
      agent: new ProxyAgent(
        `http://groups-RESIDENTIAL,country-CZ:${token}@proxy.apify.com:8000`
      ),
    };
  }
  return _agentCache.agent;
}

function extractProductId(url: string): string | null {
  const match = new URL(url).pathname.match(/4p(\d+)/i);
  return match?.[1] ?? null;
}

function labelFromUrl(url: string): string {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
  return slug
    .replace(/--4p\d+$/i, "")
    .replace(/-4p\d+$/i, "")
    .replace(/-+/g, " ")
    .trim();
}

export const smartyScraper: StockScraper = {
  storeName: "smarty",
  hostPattern: /smarty\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("Missing APIFY_TOKEN in .env");

    const productId = extractProductId(url);
    if (!productId) throw new Error(`Cannot extract product ID from Smarty URL: ${url}`);

    const stockUrl =
      `https://www.smarty.cz/Products/Product/StoreInfoItems` +
      `?productId=${productId}&productImeiId=null&query=&latitude=null` +
      `&longitude=null&inStock=false&buyoutCategoryId=null&discountPromo=&onlyShops=false`;

    const res = await proxyFetch(stockUrl, {
      dispatcher: getAgent(token),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html, */*; q=0.01",
        "Accept-Language": "cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": url,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} for ${stockUrl}`);

    const html = await res.text();
    const root = parse(html);

    // Remove "není skladem" so remaining "skladem" hits are genuine in-stock entries
    const cleaned = root.text.toLowerCase().replace(/není\s+skladem/g, "");
    const inStock = cleaned.includes("skladem");

    return {
      inStock,
      label: labelFromUrl(url),
    };
  },
};
