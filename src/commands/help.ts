import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, Colors } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("List all available commands");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("Poke-Buddy — Commands")
    .addFields(
      {
        name: "/monitor add",
        value: "Let's you add a new product to monitor! Supports Alza.cz, Smarty.cz, HraNaNetu.cz, CardStore.cz, CDMC.cz, and Xzone.cz",
        inline: false,
      },
      {
        name: "/monitor remove",
        value: "Let's you remove a product from monitoring",
        inline: false,
      },
      {
        name: "/monitor list",
        value: "Shows all monitored products with their current stock status",
        inline: false,
      },
      {
        name: "/monitor setchannel #channel",
        value: "Sets the channel where notifications will be posted when a product comes back in stock.",
        inline: false,
      },
      {
        name: "/help",
        value: "Shows this message.",
        inline: false,
      },
    );

  await interaction.reply({ embeds: [embed] });
}
