import type { StockScraper } from "./base.ts";
import { smartyScraper } from "./smarty.ts";
import { dracikScraper } from "./dracik.ts";

const registry: StockScraper[] = [smartyScraper, dracikScraper];

export function getScraperForUrl(url: string): StockScraper | null {
  try {
    const hostname = new URL(url).hostname;
    return registry.find((s) => s.hostPattern.test(hostname)) ?? null;
  } catch {
    return null;
  }
}

export function getStoreNameForUrl(url: string): string | null {
  return getScraperForUrl(url)?.storeName ?? null;
}
