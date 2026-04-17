import { parse } from "node-html-parser";
import type { StockScraper, ScrapeResult } from "./base.ts";
import { getBrowser } from "../browser.ts";

const OUT_OF_STOCK_PHRASES = ["není skladem", "nedostupné", "vyprodáno"];

export const alzaScraper: StockScraper = {
  storeName: "alza",
  hostPattern: /alza\.cz$/,

  async scrape(url: string): Promise<ScrapeResult> {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      // Block images, fonts, media — only need HTML + JS
      await page.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (["image", "font", "media", "stylesheet"].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      // Wait for availability button to be rendered
      await page.waitForSelector('button[data-testid*="availabilityText"]', { timeout: 15_000 });

      const html = await page.content();
      const root = parse(html);

      const label = root.querySelector("h1")?.text.trim() ?? url;

      const availBtn = root.querySelector('button[data-testid*="availabilityText"]');
      const availText = availBtn?.text.trim().toLowerCase() ?? "";
      const inStock =
        availText.length > 0 &&
        availText.includes("skladem") &&
        !OUT_OF_STOCK_PHRASES.some((p) => availText.includes(p));

      const rawAvail = availBtn?.text.trim() ?? "";
      const stockAmount = rawAvail.replace(/^skladem\s*/i, "").trim() || undefined;

      const priceText = root.querySelector(".ads-pb__price-value")?.text.trim();
      const price = priceText ? `${priceText} Kč` : undefined;

      return { inStock, label, price, stockAmount };
    } finally {
      await page.close();
    }
  },
};
