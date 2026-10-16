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

4. Apply the database migrations (development):

```bash
pnpm run migration:run
```

5. Seed the database (optional):

```bash
pnpm run db:seed
```

## Additional Scripts

### Database Management

```bash
# Generate and apply database migrations
pnpm run migration:generate
pnpm run migration:run
```

### 迁移口径（Migration Workflow & Provenance）

schema 的唯一真相是实体模型（`apps/api/src/database/mikro/**`·迁移实体经 `column-meta.ts` 单一源派生）；
生成物落 `apps/api/src/database/mikro/migration/migrations/`（迁移 TS 工件 + snapshot·库内台账表 `mikro_migrations`）。

- **空库 / CI / 生产**：`pnpm run migration:run`（`migrator.up()` 依序应用未执行迁移并在 `mikro_migrations` 记账），再 `pnpm run db:seed`。可复现、与台账一致。
- **本地增量开发**：改实体后 `pnpm run migration:generate`（`migrator.create()` 比对「实体元数据 ↔ 库 schema」产新工件 + 更新 snapshot），人工审 SQL 后 `pnpm run migration:run` 落库。
- `pnpm run db:reset`（= `mikro-migrate.ts --fresh` + seed）先 `schema.drop()` 删实体表 + 台账再重放基线——**破坏性·仅限本地一次性重建**，切勿指向生产。
- ⚠️ 生产只走显式 `migration:generate` + `migration:run`；不存在 push / 隐式同步通道。

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