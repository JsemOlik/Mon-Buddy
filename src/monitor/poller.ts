import type { Client, TextChannel } from "discord.js";
import { listProducts, setInStock, getConfig, type ProductRow } from "./db.ts";
import { getScraperForUrl } from "./scrapers/index.ts";
import { buildStockAlert } from "./alert.ts";

let pollHandle: ReturnType<typeof setInterval> | null = null;

export function startPoller(client: Client): void {
  const intervalMs = parseInt(getConfig("poll_interval_ms") ?? "300000", 10);
  void runPollCycle(client);
  pollHandle = setInterval(() => void runPollCycle(client), intervalMs);
  console.log(`[monitor] Poller started (interval: ${intervalMs / 1000}s)`);
}

export function stopPoller(): void {
  if (pollHandle !== null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
}

async function runPollCycle(client: Client): Promise<void> {
  const products = listProducts();
  if (products.length === 0) return;
  console.log(`[monitor] Checking ${products.length} product(s)...`);
  await Promise.allSettled(products.map((p) => checkProduct(client, p)));
}

async function checkProduct(client: Client, product: ProductRow): Promise<void> {
  const scraper = getScraperForUrl(product.url);
  if (!scraper) return;

  try {
    const result = await scraper.scrape(product.url);
    const wasInStock = product.in_stock === 1;

    setInStock(product.id, result.inStock);

    if (!wasInStock && result.inStock) {
      console.log(`[monitor] Stock alert: ${product.label}`);
      await sendAlert(client, product, result.price, result.stockAmount, result.imageUrl);
    }
  } catch (err) {
    console.error(`[monitor] Failed to check ${product.url}:`, err);
  }
}

async function sendAlert(client: Client, product: ProductRow, price?: string, stockAmount?: string, imageUrl?: string): Promise<void> {
  const channelId =
    (product.guild_id ? getConfig(`alert_channel_id:${product.guild_id}`) : null) ??
    getConfig("alert_channel_id") ??
    "";
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const { embed, row } = buildStockAlert(product, price, stockAmount, imageUrl);
    await (channel as TextChannel).send({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error(`[monitor] Failed to send alert:`, err);
  }
}
