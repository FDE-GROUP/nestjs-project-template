# Installation and Running Guide

## Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher (LTS)
- [pnpm](https://pnpm.io/) v11 (via `corepack enable`, which reads the `packageManager` field)
- [PostgreSQL](https://www.postgresql.org/) server

> **Note:** This branch's runtime is **Node + pnpm** (migrated from Bun — see [runtime amendment plan](./plans/global-runtime-node-pnpm.md)).

## Installation

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Apply the database schema (development):

```bash
pnpm run drizzle:push
```

5. Seed the database (optional):

```bash
pnpm run db:seed
```

## Additional Scripts

### Database Management

```bash
# Open Drizzle Studio
pnpm run drizzle:studio

# Generate and apply database migrations
pnpm run drizzle:generate
pnpm run drizzle:migrate
```

### 迁移口径（Migration Workflow & Provenance）

仓库内 `drizzle/` 迁移链（SQL + `meta/_journal.json`）是 **schema 的唯一真相（SSOT）**。

- **空库 / CI / 生产**：`pnpm run drizzle:migrate`（按 0000→000N 顺序应用，并在库内 `drizzle.__drizzle_migrations` 记账），再 `pnpm run db:seed`。可复现、与 journal 一致。
- **本地增量开发**：改 `apps/api/src/database/schema.ts` 后 `pnpm run drizzle:generate` 产新迁移片，再 `pnpm run drizzle:migrate` 落库——保持库内 journal 与文件链同步。
- `pnpm run drizzle:push` / `pnpm run db:reset`（= `drizzle:push --force` + seed）**不写库内 journal**，仅适合一次性把本地库强行对齐 schema；`push` 会直接执行 diff，破坏性变更前务必先看预览。
- ⚠️ 混用后果：若库由 push 建立（库内 journal 为空）后再跑 `drizzle:migrate`，会重跑已存在的建表语句而失败且错误不清。此时要么继续用 push 同步，要么**清库重建走 migrate**（`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` → `drizzle:migrate` → `db:seed`）以得到 journal 一致的规范态。

### OpenAPI Documentation

```bash
# Export OpenAPI spec (DB-free codegen, no running server required)
pnpm run openapi:export
```

## Running the Application

Development mode:

```bash
pnpm run start:dev
```

Production mode:

```bash
pnpm run build
pnpm run start:prod
```

## Code Quality

### Checking and fixing code:

```bash
# Check code quality and formatting
pnpm run check

# Fix code quality and formatting issues automatically
pnpm run check:fix

# Only check linting rules
pnpm run lint

# Fix linting issues automatically
pnpm run lint:fix
```

> **Note:** This project uses [Biome](https://biomejs.dev/) for code formatting and linting

### Formatting code:

```bash
pnpm run format
```

## Testing

The project uses **Vitest** as the test runner. Config lives at `vitest.config.ts`.

Running unit tests:

```bash
pnpm run test
```

Running tests with coverage:

```bash
pnpm run test:cov
```

Running tests in watch mode:

```bash
pnpm run test:watch
```

## API Documentation

API documentation is available at `/apidoc` when the application is running. It provides an interactive interface to explore and test the API endpoints.

http://localhost:7009/apidoc#/