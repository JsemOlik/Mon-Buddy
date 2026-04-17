import { EmbedBuilder, Colors } from "discord.js";
import type { ProductRow } from "./db.ts";

const storeDisplayNames: Record<string, string> = {
  hrananetu: "HranaNetu.cz",
  cardstore: "CardStore.cz",
};

export function buildStockAlert(product: ProductRow, price?: string): EmbedBuilder {
  const storeName = storeDisplayNames[product.store] ?? product.store;

  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("Back in Stock!")
    .setDescription(`**${product.label}** is now available on **${storeName}**!`)
    .setURL(product.url)
    .addFields(
      { name: "Store", value: storeName, inline: true },
      { name: "Price", value: price ?? "—", inline: true },
      { name: "Link", value: `[View Product](${product.url})`, inline: false },
    )
    .setTimestamp()
    .setFooter({ text: `Monitor ID: ${product.id}` });
}
