# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Poke-Buddy is a Discord.js bot built with Bun runtime and TypeScript. It is currently in early development — only the boilerplate scaffold exists.

## Commands

```bash
bun install          # Install dependencies
bun run index.ts     # Run the bot
```

No test or lint scripts are configured yet.

## Tech Stack

- **Runtime:** Bun (v1.3.12+)
- **Language:** TypeScript (strict mode, ESNext target)
- **Discord library:** discord.js v14
- **Module system:** ES modules (`"type": "module"`)

## Architecture

Entry point is `index.ts` at the project root. The project follows a standard discord.js v14 bot structure:

- Discord.js v14 uses slash commands registered via the REST API (`@discordjs/rest`) and handles events through a `Client` instance.
- Bot token and environment secrets should be loaded from environment variables (Bun supports `.env` files natively — no dotenv package needed).
- Slash commands are typically built with `@discordjs/builders` (`SlashCommandBuilder`) and deployed separately from the bot process.

## TypeScript Config Notes

- `allowImportingTsExtensions: true` — import `.ts` files directly (Bun resolves them).
- `noEmit: true` — Bun runs TypeScript directly; no compilation step needed.
