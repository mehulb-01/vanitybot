# Discord Bot — Moderation / Economy / Music

A modular, sarcastic, production-minded Discord bot. Built in phases; this is
**Phase 1**: project skeleton, Discord client, command/event loaders,
config, database connectivity, and logging. No moderation, economy, or
music features exist yet — those are Phases 2–4.

## Stack

Node.js · TypeScript · discord.js v14 · PostgreSQL · Prisma · Redis ·
Lavalink (Phase 4) · Docker Compose

## Phase 1 — what's here

- `src/index.ts` — entrypoint (env → db → redis → client → loaders → login)
- `src/bot/client.ts` — extended `Client` with a typed `commands` collection
- `src/bot/loaders/*` — recursive command & event file loaders
- `src/bot/events/*` — `ready`, `interactionCreate`, `error`
- `src/bot/commands/utility/ping.ts` — a single working command to prove the pipeline
- `src/config/*` — zod-validated env, static app config
- `src/database/*` — Prisma singleton, Redis singleton
- `src/utils/*` — logger (pino), reusable embed builders
- `prisma/schema.prisma` — `Guild` + `GuildSettings` only, for now
- `scripts/registerCommands.ts` — dev-guild / global slash command registration

## 1. Clone & install

```bash
git clone <your-repo-url>
cd discord-bot
npm install
```

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in `DISCORD_TOKEN`, `CLIENT_ID`, and `DEV_GUILD_ID` from the
[Discord Developer Portal](https://discord.com/developers/applications).
Leave `DATABASE_URL` / `REDIS_URL` as-is if you use the provided Docker Compose.

## 3. Start local infrastructure

```bash
docker compose up -d
```

This brings up Postgres and Redis only. The bot itself runs on your host
via `npm run dev` for now — a bot container + Lavalink arrive in later phases.

## 4. Run Prisma migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

## 5. Register slash commands (dev guild — instant)

```bash
npm run register:dev
```

Use `npm run register:global` only when you're ready for production
(propagation can take up to ~1 hour).

## 6. Start the bot

```bash
npm run dev
```

You should see structured startup logs, and `/ping` should respond in
your test server.

## 7. Run tests

```bash
npm test
```

(No tests yet in Phase 1 — the harness is wired up for Phase 2 onward.)

## 8. Production

```bash
npm run build
npm run prisma:deploy
npm start
```

## Roadmap

- ✅ Phase 1 — project setup, client, loaders, config, DB, logging
- ⬜ Phase 2 — permissions, moderation commands + database + logging
- ⬜ Phase 3 — economy database, balance/daily/work/crime/pay/leaderboard/shop
- ⬜ Phase 4 — Lavalink integration, music player, queue, controls
- ⬜ Phase 5 — automod, quests, XP/levels, advanced games, admin config
- ⬜ Phase 6 — testing, optimization, docs, Docker deployment, security review
