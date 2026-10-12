# Drizzle Migration and Seeding Setup

This document provides comprehensive guidance for using Drizzle ORM migrations and seeding in this NestJS project with PostgreSQL.

## Quick Start

### First Time Setup
```bash
# Setup everything: apply schema and seed data (development)
bun run db:setup
```

### Development Workflow
```bash
# 1. Make changes to src/database/schema.ts
# 2. Generate SQL migration files from schema diff
bun run drizzle:generate

# 3. Apply migrations to the database
bun run drizzle:migrate

# 4. Seed database with sample data
bun run db:seed
```

## Available Commands

### Migration Commands
| Command | Description | Environment |
|---------|-------------|-------------|
| `bun run drizzle:generate` | Generate SQL migration files from schema changes | Development |
| `bun run drizzle:migrate` | Apply generated migrations to the database | Dev / Production |
| `bun run drizzle:push` | Push schema directly to database (no migration files, development only) | Development |

### Database Management
| Command | Description |
|---------|-------------|
| `bun run db:seed` | Run database seeding |
| `bun run db:reset` | Reset schema (force push) and reseed |
| `bun run db:setup` | Full setup (push schema + seed) |

### Drizzle Tools
| Command | Description |
|---------|-------------|
| `bun run drizzle:studio` | Open Drizzle Studio (browse/edit data) |

## 🌱 Seeding Options

### Basic Usage
```bash
# Standard seeding
bun run db:seed

# Only essential data (no test posts)
bun run db:seed -- --no-test-data

# Custom number of users and posts
bun run db:seed -- --users 5 --posts 10
```

### Environment Variables
```bash
# Custom admin password
ADMIN_PASSWORD=your_secure_password bun run db:seed

# Custom user password
USER_PASSWORD=user_secure_password bun run db:seed

# Clean database before seeding
SEED_CLEANUP=true bun run db:seed
```

## PostgreSQL Specific Notes

Unlike MongoDB, PostgreSQL is a strongly-typed relational database, so schema changes must be tracked with versioned migrations:

- **`drizzle:generate`** produces reviewable SQL migration files under `drizzle/`.
- **`drizzle:migrate`** applies those files; use it in production.
- **`drizzle:push`** is a convenience for rapid local iteration (it does not create migration history) — avoid it in production.

## 📁 Project Structure

```
drizzle.config.ts          # Drizzle Kit configuration (dialect, schema path, output)
src/database/
├── schema.ts              # Table & enum definitions (source of truth)
├── drizzle.service.ts     # NestJS provider wrapping the Drizzle client
├── database.module.ts     # Global module exporting DrizzleService
└── seed.ts                # Seeding script
drizzle/                   # Generated SQL migration files (created by drizzle:generate)
```

## Production Deployment

```bash
# Generate migration files from schema (commit these to VCS)
bun run drizzle:generate

# Apply migrations against the production database
NODE_ENV=production bun run drizzle:migrate

# Seed essential data only
bun run db:seed -- --no-test-data
```
