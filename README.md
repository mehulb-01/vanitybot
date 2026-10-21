# Vanity - Discord Bot

A modular, production-ready Discord bot with moderation, economy, music, and gang systems. Built with TypeScript, Discord.js v14, PostgreSQL, Redis, and Lavalink.

## Tech Stack

- **Runtime**: Node.js >= 20.0.0
- **Language**: TypeScript 5.6+
- **Discord Library**: discord.js v14.16.3
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis (ioredis)
- **Music**: Lavalink 4 with YouTube plugin and LavaSrc
- **Containerization**: Docker Compose (PostgreSQL, Redis, Lavalink)
- **Testing**: Vitest
- **Logging**: Pino
- **Validation**: Zod

## Project Structure

```
Vanity/
├── discord-bot/              # Main bot application
│   ├── src/
│   │   ├── index.ts          # Application entry point
│   │   ├── bot/              # Discord client and bot logic
│   │   │   ├── client.ts     # Extended Discord.js Client with Lavalink
│   │   │   ├── commands/     # Slash command implementations
│   │   │   │   ├── economy/  # Economy commands (blackmarket, clockin, mug, trader)
│   │   │   │   ├── gangs/    # Gang system commands (bail, crime, deposit, heist, etc.)
│   │   │   │   ├── music/    # Music player commands (play, skip, queue, etc.)
│   │   │   │   └── utility/  # Utility commands (ping, help, userinfo, etc.)
│   │   │   ├── events/       # Discord event handlers
│   │   │   ├── interactions/ # Interaction handlers
│   │   │   └── loaders/      # Command and event file loaders
│   │   ├── config/           # Configuration management
│   │   │   ├── env.ts        # Environment variable validation (Zod)
│   │   │   └── config.ts     # Static app configuration
│   │   ├── database/         # Database connections and repositories
│   │   │   ├── database.ts   # Prisma client singleton
│   │   │   ├── redis.ts      # Redis client singleton
│   │   │   └── repositories/ # Data access layer
│   │   ├── services/         # Business logic services
│   │   │   ├── cooldownService.ts  # Cooldown management
│   │   │   ├── economy/      # Economy business logic
│   │   │   ├── gangs/        # Gang system business logic
│   │   │   ├── music/        # Music player and Lavalink integration
│   │   │   └── utility/      # Utility services
│   │   ├── types/            # TypeScript type definitions
│   │   │   ├── command.ts    # Command interface
│   │   │   └── music.ts      # Music-related types
│   │   ├── utils/            # Utility functions
│   │   │   ├── logger.ts     # Pino logger configuration
│   │   │   ├── embeds.ts     # Discord embed builders
│   │   │   ├── emoji.ts      # Emoji helpers
│   │   │   └── format.ts     # Formatting utilities
│   │   └── constants/        # Application constants
│   ├── prisma/
│   │   ├── schema.prisma     # Database schema definition
│   │   └── migrations/       # Database migrations
│   ├── scripts/
│   │   └── registerCommands.ts  # Slash command registration script
│   ├── plugins/              # Lavalink plugins
│   │   └── application.yml   # Lavalink configuration
│   ├── lavalink/             # Lavalink plugin JARs
│   │   ├── lavasrc-plugin-4.8.3.jar
│   │   └── youtube-plugin-2be8e542d3f6f178e048dca565892684c2e40177.jar
│   ├── tests/                # Test files
│   ├── dist/                 # Compiled JavaScript output
│   ├── node_modules/         # Dependencies
│   ├── .env                  # Environment variables (not committed)
│   ├── package.json          # Project dependencies and scripts
│   ├── tsconfig.json         # TypeScript configuration
│   ├── .eslintrc.cjs         # ESLint configuration
│   ├── .prettierrc           # Prettier configuration
│   ├── docker-compose.yml    # Docker services (Postgres, Redis, Lavalink)
│   └── README.md             # Bot-specific README
└── music/                    # Empty directory (reserved for future use)
```

## Database Schema

The bot uses PostgreSQL with Prisma ORM. Key models include:

### Core Models
- **Guild**: Stores Discord guild information
- **GuildSettings**: Per-guild configuration (moderation, economy, music, gangs settings)

### Gang System Models
- **Gang**: 6 global gangs with treasury, color, emoji
- **GangBoss**: Monthly elected or Syndicate-appointed gang leaders
- **GangVote**: Member votes for monthly gang boss elections
- **UserGangMembership**: User's gang membership (global across servers)
- **ServerGangSettings**: Per-server gang role configuration
- **GangQuotaDeposit**: Daily quota contributions by gang members

### Economy Models
- **UserEconomy**: User wallet, bank, criminal record, crime statistics
- **UserInventoryItem**: Items owned by users (lockpick, kevlar vest, C4, etc.)

### Voice System
- **VoiceTime**: Tracks user voice channel time per guild

## Environment Variables

Create a `.env` file in the `discord-bot/` directory with the following variables:

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_application_client_id
DEV_GUILD_ID=your_test_guild_id  # Optional, for dev command registration

# Database
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require

# Redis
REDIS_URL=redis://host:port

# Lavalink (Music)
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false

# Application
NODE_ENV=development  # development | production | test
LOG_LEVEL=info       # fatal | error | warn | info | debug | trace
DEFAULT_CURRENCY_NAME=Credits

# Spotify (Optional - for LavaSrc)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

## Configuration Files

### package.json Scripts

```json
{
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "build": "tsc -p tsconfig.json",
  "start": "node dist/index.js",
  "register:dev": "ts-node-dev --transpile-only scripts/registerCommands.ts dev",
  "register:global": "ts-node-dev --transpile-only scripts/registerCommands.ts global",
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate dev",
  "prisma:deploy": "prisma migrate deploy",
  "prisma:studio": "prisma studio",
  "lint": "eslint \"src/**/*.ts\"",
  "lint:fix": "eslint \"src/**/*.ts\" --fix",
  "format": "prettier --write \"src/**/*.ts\"",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### TypeScript Configuration (tsconfig.json)

- Target: ES2022
- Module: CommonJS
- Strict mode enabled
- Path alias: `@/*` maps to `src/*`
- Output directory: `dist/`

### ESLint Configuration (.eslintrc.cjs)

- Parser: @typescript-eslint/parser
- Extends: eslint:recommended, @typescript-eslint/recommended, prettier
- Rules: Warn on `any`, unused vars, console usage

### Prettier Configuration (.prettierrc)

- Semicolons: enabled
- Quotes: single
- Trailing commas: all
- Print width: 100
- Tab width: 2

### Docker Compose (docker-compose.yml)

Services:
- **postgres**: PostgreSQL 16 Alpine (port 5432)
- **redis**: Redis 7 Alpine (port 6379)
- **lavalink**: Lavalink 4 (port 2333) with plugin support

### Lavalink Configuration (plugins/application.yml)

- YouTube plugin with latest cipher fixes
- LavaSrc plugin for Spotify/Apple Music/Deezer support
- Latency optimization settings
- Buffer and quality tuning

## Installation & Setup

### 1. Clone and Install Dependencies

```bash
cd discord-bot
npm install
```

### 2. Configure Environment

```bash
# Copy the example .env file (create one if it doesn't exist)
# Fill in your Discord credentials and database URLs
```

Required Discord credentials from [Discord Developer Portal](https://discord.com/developers/applications):
- **DISCORD_TOKEN**: Bot token
- **CLIENT_ID**: Application ID
- **DEV_GUILD_ID**: Test server ID (for instant command updates)

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, and Lavalink containers.

### 4. Setup Database

```bash
npm run prisma:generate
npm run prisma:migrate
```

This generates the Prisma client and runs migrations to create database tables.

### 5. Register Slash Commands

For development (instant updates):
```bash
npm run register:dev
```

For production (can take up to 1 hour to propagate):
```bash
npm run register:global
```

### 6. Start the Bot

Development mode with hot reload:
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## Features

### Utility Commands
- `/ping` - Check bot latency
- `/help` - Display command help
- `/userinfo` - Show user information
- `/serverinfo` - Show server information
- `/avatar` - Show user avatar
- `/banner` - Show user banner
- `/invite` - Get bot invite link
- `/poll` - Create a poll
- `/prune` - Bulk delete messages
- `/remind` - Set reminders
- `/afk` - Set AFK status
- `/uptime` - Show bot uptime

### Economy Commands
- `/blackmarket` - Buy illegal items
- `/clockin` - Daily work reward
- `/mug` - Attempt to mug another user
- `/trader` - Trade with NPC traders

### Gang System Commands
- `/gangjoin` - Join a gang
- `/gangchange` - Change gangs (with cooldown)
- `/gangprof` - View gang profile
- `/gangsetup` - Configure gang roles on server
- `/deposit` - Deposit to gang treasury
- `/withdraw` - Withdraw from gang treasury
- `/payquota` - Pay daily gang quota
- `/crime` - Commit crimes for rewards
- `/heist` - Organize gang heists
- `/bail` - Bail out jailed members
- `/bossvote` - Vote for gang boss
- `/inventory` - View your inventory

### Music Commands
- `/play` - Play a track or playlist
- `/skip` - Skip current track
- `/pause` - Pause playback
- `/resume` - Resume playback
- `/stop` - Stop playback and clear queue
- `/queue` - View the queue
- `/nowplaying` - Show current track
- `/volume` - Adjust volume
- `/loop` - Toggle loop mode
- `/shuffle` - Shuffle the queue
- `/remove` - Remove a track from queue
- `/seek` - Seek to a position
- `/move` - Move a track in queue
- `/join` - Join voice channel
- `/leave` - Leave voice channel

## Key Implementation Details

### Bot Client (src/bot/client.ts)
- Extends Discord.js Client with custom properties
- Integrates Lavalink manager for music playback
- Configured intents: Guilds, Messages, VoiceStates, Reactions, DMs
- Forwards raw voice events to Lavalink

### Command Loading (src/bot/loaders/commandLoader.ts)
- Recursively loads command files from `src/bot/commands/`
- Registers commands in a Collection for fast lookup
- Supports nested directory structure

### Event Loading (src/bot/loaders/eventLoader.ts)
- Recursively loads event handlers from `src/bot/events/`
- Registers Discord events (ready, interactionCreate, voiceStateUpdate, etc.)

### Environment Validation (src/config/env.ts)
- Uses Zod for runtime validation
- Fails fast on missing or invalid environment variables
- Type-safe access to environment variables

### Database Layer (src/database/)
- Prisma singleton for PostgreSQL access
- Redis singleton for caching and cooldowns
- Repository pattern for data access

### Services Layer (src/services/)
- Business logic separated from command handlers
- Cooldown service for rate limiting
- Economy service for financial operations
- Gang service for gang management
- Music service for Lavalink integration

### Logging (src/utils/logger.ts)
- Pino logger with structured logging
- Configurable log levels
- Production-friendly output

## Testing

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch
```

## Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Production Deployment

1. Build the project:
```bash
npm run build
```

2. Deploy database migrations:
```bash
npm run prisma:deploy
```

3. Register global commands:
```bash
npm run register:global
```

4. Start the bot:
```bash
npm start
```

Ensure all environment variables are set for production, especially:
- `NODE_ENV=production`
- Secure `DATABASE_URL` with SSL
- Secure `REDIS_URL`
- Proper Lavalink configuration

## Development Notes

- The bot uses path aliases (`@/*`) for cleaner imports
- Hot reload is enabled in development mode via ts-node-dev
- Discord slash commands must be re-registered after changes
- Database changes require Prisma migrations
- Lavalink plugins are auto-downloaded from Maven repositories
- Voice sessions are saved on graceful shutdown

## Architecture

The bot follows a layered architecture:

1. **Presentation Layer**: Discord slash commands and interactions
2. **Application Layer**: Services containing business logic
3. **Data Layer**: Repositories for database/cache access
4. **Infrastructure Layer**: Database, Redis, Lavalink connections

This separation ensures testability, maintainability, and clear separation of concerns.

## Dependencies

### Core Dependencies
- `@prisma/client` - Prisma ORM client
- `discord.js` - Discord API wrapper
- `dotenv` - Environment variable loading
- `ioredis` - Redis client
- `lavalink-client` - Lavalink integration
- `pino` - Structured logging
- `zod` - Schema validation

### Development Dependencies
- `@types/node` - Node.js type definitions
- `@typescript-eslint/*` - TypeScript linting
- `eslint` - Code linting
- `prettier` - Code formatting
- `prisma` - Prisma CLI
- `ts-node-dev` - TypeScript development server
- `typescript` - TypeScript compiler
- `vitest` - Testing framework

## License

ISC

## Author

Your Name

## Support

For issues or questions, please open an issue on the repository or contact the maintainers.
