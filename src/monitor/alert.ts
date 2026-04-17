import { EmbedBuilder, Colors } from "discord.js";
import type { ProductRow } from "./db.ts";

const storeDisplayNames: Record<string, string> = {
  hrananetu: "HranaNetu.cz",
  cardstore: "CardStore.cz",
  cdmc: "CDMC.cz",
};

export function buildStockAlert(
  product: ProductRow,
  price?: string,
  stockAmount?: string,
): EmbedBuilder {
  const storeName = storeDisplayNames[product.store] ?? product.store;

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "Store", value: storeName, inline: true },
    { name: "Price", value: price ?? "—", inline: true },
  ];

  if (stockAmount) {
    fields.push({ name: "In Stock", value: stockAmount, inline: true });
  }

  fields.push({ name: "Link", value: `[View Product](${product.url})`, inline: false });

  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("Back in Stock!")
    .setDescription(`**${product.label}** is now available on **${storeName}**!`)
    .setURL(product.url)
    .addFields(...fields)
    .setTimestamp()
    .setFooter({ text: `Monitor ID: ${product.id}` });
}
