import {
  type Client,
  ChannelType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventEntityType,
} from "discord.js";
import type { ProductRow } from "./db.ts";
import { getConfig } from "./db.ts";

// Parse "Vychází 24.4.2026" or bare "24.4.2026" → Date at noon Prague time (10:00 UTC).
function parseReleaseDate(releaseDate: string): Date | null {
  const m = releaseDate.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  // 10:00 UTC ≈ 12:00 Prague summer (CEST = UTC+2)
  return new Date(`${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}T10:00:00Z`);
}

async function fetchImageAsDataUri(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return undefined;
  }
}

export async function createReleaseEvent(
  client: Client,
  product: ProductRow,
  releaseDate: string,
  imageUrl?: string,
): Promise<void> {
  const guildId = product.guild_id;
  if (!guildId) return;

  const eventChannelId = await getConfig(`event_channel_id:${guildId}`);
  if (!eventChannelId) return; // events not configured for this guild

  const startTime = parseReleaseDate(releaseDate);
  if (!startTime) {
    console.warn(`[events] Could not parse release date: "${releaseDate}"`);
    return;
  }
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 h

  const image = imageUrl ? await fetchImageAsDataUri(imageUrl) : undefined;

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await client.channels.fetch(eventChannelId).catch(() => null);

    const isVoice = channel?.type === ChannelType.GuildVoice;
    const isStage = channel?.type === ChannelType.GuildStageVoice;

    if (isVoice || isStage) {
      await guild.scheduledEvents.create({
        name: product.label.slice(0, 100),
        scheduledStartTime: startTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: isStage
          ? GuildScheduledEventEntityType.StageInstance
          : GuildScheduledEventEntityType.Voice,
        channel: eventChannelId,
        description: product.url,
        ...(image ? { image } : {}),
      });
    } else {
      // Text channel or no channel → external event, location = product URL
      await guild.scheduledEvents.create({
        name: product.label.slice(0, 100),
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: product.url },
        description: product.url,
        ...(image ? { image } : {}),
      });
    }

    console.log(`[events] Created scheduled event for "${product.label}" on ${startTime.toISOString()}`);
  } catch (err) {
    console.error(`[events] Failed to create event for "${product.label}":`, err);
  }
}
