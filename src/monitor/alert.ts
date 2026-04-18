import { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import type { ProductRow } from "./db.ts";

const storeDisplayNames: Record<string, string> = {
  hrananetu: "HraNaNetu.cz",
  cardstore: "CardStore.cz",
  cdmc:      "CDMC.cz",
  xzone:     "Xzone.cz",
  alza:      "Alza.cz",
  smarty:    "Smarty.cz",
};

const storeColors: Record<string, number> = {
  hrananetu: 0x4b0082, // dark purple
  cardstore: 0xffd700, // gold
  cdmc:      0xe74c3c, // red
  xzone:     0xEB6524, // orange
  alza:      0x00a650, // alza green
  smarty:    0xe4007c, // smarty magenta
};

export function buildStockAlert(
  product: ProductRow,
  alertType: "in-stock" | "pre-order",
  price?: string,
  stockAmount?: string,
  imageUrl?: string,
): { embed: EmbedBuilder; row: ActionRowBuilder<ButtonBuilder> } {
  const storeName = storeDisplayNames[product.store] ?? product.store;
  const color = alertType === "pre-order" ? Colors.Blue : (storeColors[product.store] ?? Colors.Green);

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "Store", value: storeName, inline: true },
    { name: "Price", value: price ?? "—", inline: true },
  ];

  if (stockAmount) {
    fields.push({ name: alertType === "pre-order" ? "Pre-order Qty" : "In Stock", value: stockAmount, inline: true });
  }

  const title = alertType === "pre-order" ? "Pre-order Available!" : "Back in Stock!";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`**${product.label}**`)
    .setURL(product.url)
    .addFields(...fields)
    .setTimestamp()
    .setFooter({ text: `ID: ${product.id}` });

  if (imageUrl) embed.setImage(imageUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(alertType === "pre-order" ? "Pre-order Now" : "View Product")
      .setURL(product.url)
      .setStyle(ButtonStyle.Link),
  );

  return { embed, row };
}
