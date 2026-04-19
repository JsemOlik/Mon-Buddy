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

    // Price is inside .price-num — "0 Kč" means not yet released
    const priceNumRaw = root.querySelector(".price-num")?.text.replace(/\s+/g, " ").trim() ?? "";
    const priceValue = parseInt(priceNumRaw.replace(/\D/g, ""), 10);
    const price = priceNumRaw || undefined;

    // Green span = in-stock e.g. "Skladem: > 10 ks"
    // Red span   = unavailable e.g. "Na eshopu nemáme dostupné"
    const greenSpan = root.querySelector("span.text-green");
    const redSpan   = root.querySelector("span.text-red");

    let stock: ScrapeResult["stock"];
    let stockAmount: string | undefined;

    if (greenSpan) {
      const text = greenSpan.text.trim();
      stockAmount = text;
      if (text.toLowerCase().includes("předprodej") || text.toLowerCase().includes("předobjednávka")) {
        stock = "pre-order";
      } else {
        stock = "in-stock";
      }
    } else if (redSpan) {
      // Price 0 (or missing) = not yet released; valid price = just out of stock
      stock = (!priceValue || priceValue === 0) ? "not-released" : "not-in-stock";
    } else {
      stock = "not-in-stock";
    }

    const imagePath = root.querySelector(".image-holder img")?.getAttribute("src") ?? undefined;
    const imageUrl = imagePath ? `https://www.vesely-drak.cz${imagePath}` : undefined;

    return { stock, label, price, stockAmount, imageUrl };
  },
};
