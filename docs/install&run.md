# 安装与运行指南

## 前置条件

- [Node.js](https://nodejs.org/) v22 或更高（LTS）
- [pnpm](https://pnpm.io/) v11（经 `corepack enable` 启用，读取 `package.json` 的 `packageManager` 字段锁定版本）
- [PostgreSQL](https://www.postgresql.org/) 数据库服务

> **说明：** 本分支运行时为 **Node + pnpm**（已从 Bun 迁移，见 [运行时修宪案](./plans/global-runtime-node-pnpm.md)）。
> 快速起一个本地 PostgreSQL 可用仓库自带的 `docker-compose.dev.yml`（`postgres:16-alpine` · db `nestjs_practice` · user/pass `postgres`）：
> `docker compose -f docker-compose.dev.yml up -d postgres`。

## 安装步骤

1. 克隆仓库
2. 安装依赖：

```bash
pnpm install
```

3. 配置环境变量：

```bash
cp .env.example .env
# 按需编辑 .env（数据库连接串、密钥等）
```

4. 应用数据库迁移（开发）：

```bash
pnpm run migration:run
```

5. 写入种子数据（可选）：

```bash
pnpm run db:seed
```

> 第 4、5 步可用一条 `pnpm run db:setup`（= `migration:run` + `db:seed`）一次完成。
>
> 重新播种：seed 对测试用户非幂等，重复 `db:seed` 会撞唯一键；dev 重播用 `SEED_CLEANUP=true pnpm run db:seed`（先清 `post` + `user`）或 `pnpm run db:reset`（破坏性·仅限本地）。

## 其他脚本

### 数据库管理

```bash
# 生成并应用数据库迁移
pnpm run migration:generate
pnpm run migration:run
```

### 迁移口径（Migration Workflow & Provenance）

schema 的唯一真相是实体模型（`apps/api/src/database/mikro/**`·迁移实体经 `column-meta.ts` 单一源派生）；
生成物落 `apps/api/src/database/mikro/migration/migrations/`（迁移 TS 工件 + snapshot·库内台账表 `mikro_migrations`）。

- **空库 / CI / 生产**：`pnpm run migration:run`（`migrator.up()` 依序应用未执行迁移并在 `mikro_migrations` 记账），再 `pnpm run db:seed`。可复现、与台账一致。生产跑 seed 须先配 `ADMIN_PASSWORD`/`USER_PASSWORD`，否则 fail-loud 拒跑（先于建连·弱口令永不静默上图）。
- **本地增量开发**：改实体后 `pnpm run migration:generate`（`migrator.create()` 比对「实体元数据 ↔ 库 schema」产新工件 + 更新 snapshot），人工审 SQL 后 `pnpm run migration:run` 落库。
- `pnpm run db:reset`（= `mikro-migrate.ts --fresh` + seed）先 `schema.drop()` 删实体表 + 台账再重放基线——**破坏性·仅限本地一次性重建**，切勿指向生产。
- ⚠️ 生产只走显式 `migration:generate` + `migration:run`；不存在 push / 隐式同步通道。

> ⚠️ schema 迁移属 **AGENTS §2 高危**，生产/破坏性操作须人自行执行、Agent 不代跑。

### OpenAPI 文档

```bash
# 导出 OpenAPI 规格（DB-free 代码生成，无需起服务）
pnpm run openapi:export
```

## 运行应用

开发模式：

```bash
pnpm run start:dev
```

生产模式：

```bash
pnpm run build
pnpm run start:prod
```

前端自助面（`apps/web`·本地开发经 `/api` 同源反代到后端）：

```bash
pnpm run dev:web    # Vite :5173 · /api/* 反代 → 后端 :7009
```

## 代码质量

### 检查与修复：

```bash
# 检查代码质量与格式
pnpm run check

# 自动修复代码质量与格式问题
pnpm run check:fix

# 仅检查 lint 规则
pnpm run lint

# 自动修复 lint 问题
pnpm run lint:fix
```

> **说明：** 本项目使用 [Biome](https://biomejs.dev/) 做代码格式化与 lint。

### 格式化代码：

```bash
pnpm run format
```

## 测试

测试运行器为 **Vitest**，配置在 `vitest.config.ts`。

运行单元测试：

```bash
pnpm run test
```

带覆盖率运行：

```bash
pnpm run test:cov
```

监听模式运行：

```bash
pnpm run test:watch
```

## API 文档

应用运行时，API 文档可在 `/apidoc` 访问（该路径已在全局前缀之外排除），提供交互式界面浏览与测试各端点：

- Swagger UI：`http://localhost:7009/apidoc`
- OpenAPI JSON：`http://localhost:7009/openapi.json`
- OpenAPI YAML：`http://localhost:7009/openapi.yaml`
