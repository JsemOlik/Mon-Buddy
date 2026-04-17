import type { StockScraper, ScrapeResult } from "./base.ts";

const ACTOR_ID = "bytepulselabs~smarty-product-scraper";

interface ApifyProduct {
  url?: string;
  name?: string;
  availability?: string;
  price?: { value: number; currency: string };
}

export const smartyScraper: StockScraper = {
  storeName: "smarty",
  hostPattern: /smarty\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error("Missing APIFY_TOKEN in .env");

    const apiUrl =
      `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
      `?token=${token}&timeout=240&memory=1024`;

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: [{ url }],
        proxy: { useApifyProxy: true, apifyProxyCountry: "CZ" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Apify error ${res.status}: ${body}`);
    }

    const items = (await res.json()) as ApifyProduct[];
    const item = items.find((i) => i.url === url) ?? items[0];

    if (!item) throw new Error("Apify returned no product data for this URL");

    const avail = item.availability?.toLowerCase() ?? "";
    const inStock = avail.includes("in stock") || avail.includes("skladem");

    return {
      inStock,
      label: item.name ?? url,
      price: item.price ? `${item.price.value} ${item.price.currency}` : undefined,
    };
  },
};
