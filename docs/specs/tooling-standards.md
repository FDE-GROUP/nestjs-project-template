# 工具使用规范（Tooling Standards）

> 状态：现行 · 适用仓库：`nestjs-project-template` · 关联文档：[architecture.md](./architecture.md)、[drizzle-migration-guide.md](../drizzle-migration-guide.md)

本文件定义本项目的**唯一合规工具链**及其使用规则。目的：消除同类工具并存导致的配置漂移、构建失败与运行时陷阱。凡新增/升级工具，须先更新本规范并走一次提交。

## 1. 基本原则

- **单一职责、单一选型**：每类能力（运行时、格式化、测试、迁移……）只允许一个工具，禁止引入同类替代品混用。
- **显式优于隐式**：工具行为（尤其是迁移、格式化、提交校验）必须可复现、可审阅，禁止依赖隐式默认。
- **运行时约束优先**：本项目为 **ESM + Bun + 装饰器元数据** 三重约束，任何会擦除运行时类引用或改写导入形态的工具都必须配置豁免（见 §4、§6）。
- **版本以 `package.json` 为准**：本文件只记录选型与约束，精确版本以 lockfile 为唯一事实来源。

## 2. 工具矩阵

| 能力域 | 选型工具 | 版本基线 | 定位 | 强制/推荐 |
|--------|----------|----------|------|-----------|
| 运行时 + 包管理 | **Bun** | ≥1.0（当前 1.3.14） | 执行 TS 源码、安装依赖、跑脚本 | 强制（唯一） |
| 语言/类型系统 | **TypeScript** | ^5.9.3 | 类型检查；`emitDecoratorMetadata` 必需 | 强制 |
| 应用框架 | **NestJS** | ^12.1.3 | 模块化 DI、装饰器 | 强制 |
| HTTP 适配 | **Fastify**（platform-fastify） | ^5.12.5 | 替代 Express 的平台层 | 强制 |
| CQRS 总线 | **@nestjs/cqrs** | ^12.1.0 | Command/Query/EventBus | 强制（架构约束） |
| ORM | **Drizzle ORM** | ^0.44.7 | 类型安全 SQL 映射 | 强制 |
| 数据库驱动 | **postgres**（postgres.js） | ^3.4.9 | Drizzle 底层驱动 | 强制 |
| 迁移/CLI | **drizzle-kit** | ^0.31.11 | generate/migrate/push/studio | 强制 |
| 认证 | **Better Auth** | ^1.7.7 | 会话/凭证（drizzleAdapter） | 强制 |
| 校验 | **class-validator + class-transformer** | ^0.15.1 / ^0.5.1 | DTO 校验 + ValidationPipe | 强制 |
| 配置校验 | **Joi + @nestjs/config** | ^18.2.9 / ^12.0.1 | env schema 校验 | 强制 |
| 编译/构建 | **@nestjs/cli + SWC** | cli ^12.0.8 / @swc/core ^1.16.18 | `nest build --builder swc` | 强制 |
| 测试运行器 | **Vitest** | ^5.0.4 | 单元/集成测试 | 强制（唯一） |
| 测试元数据 | **unplugin-swc** | ^1.5.5 | Vitest 下保留装饰器元数据 | 强制 |
| 覆盖率 | **@vitest/coverage-v8** | ^5.0.4 | v8 provider | 强制 |
| HTTP 断言 | **supertest** | ^7.3.1 | 端到端断言（按需） | 推荐 |
| Lint + 格式化 | **Biome** | ^2.5.15 | 单工具替代 ESLint+Prettier（文件级） | 强制（唯一） |
| 代码库智能/静态分析 | **fallow** | 3.33.1 | 前置分析器（非判决）：跨文件仓库图给出未用代码/重复/循环/复杂度/架构边界的**候选线索**；结论须二次人工核验 | 推荐（经 `bunx`） |
| 本地 CI 编排 | **scripts/ci.ts**（Bun Shell） | — | 一键全量门禁：`check`→`build:nest`→`test` + fallow 佐证；pre-push 自动触发，**替代远程 CI** | 强制 |
| Git Hooks | **husky** | ^9.1.7 | pre-commit → `lint:fix`；pre-push → `ci` | 强制 |
| 提交校验 | **commitlint** | ^21.2.3 | Conventional Commits | 强制 |
| 日志 | **pino**（+ pino-pretty） | ^10.4.0 | 结构化日志 | 强制 |
| API 文档 | **@nestjs/swagger** | ^12.0.2 | `/apidoc` + OpenAPI 导出 | 强制 |
| 清理 | **rimraf** | ^6.1.3 | `prebuild` 清 dist | 强制 |
| 容器/DB 环境 | **Docker Compose** | Docker 29.x | 本地 Postgres 供给 | 强制（dev） |
| 密码哈希 | **bcryptjs** | ^3.0.3 | 纯 JS、免原生编译 | 强制 |
| 支付 | **stripe** | ^23.0.0 | stripe 上下文 | 领域相关 |

## 3. 选型红线（禁止项）

- **禁止** 使用 npm / pnpm / yarn 安装依赖 —— 统一 `bun` / `bunx`。
- **禁止** 引入 ESLint / Prettier 及任一 `eslint-*`/`prettier` 插件 —— 已由 Biome 全量承担。
- **禁止** 使用 `jest` / `mocha` / `bun test`（`bun:test`）—— 测试统一 Vitest。
- **禁止** Prisma / TypeORM / MongoDB 等第二套 ORM/DB —— 统一 Drizzle + PostgreSQL。
- **禁止** `drizzle-kit push` 进入 CI/生产做 schema 同步 —— 生产只走显式 `generate` + `migrate`。
- **禁止** 在依赖注入构造函数里对被注入类使用 `import type`（见 §4.3）。
- **禁止** 未经二次人工核验即按 fallow（或任何前置分析器）的结论删除代码/依赖或重构 —— 其输出为候选线索而非判决（见 §4.7）。
- **禁止** 用 `--no-verify` 绕过 husky/commitlint；**禁止** 修改全局 git 身份（提交用内联身份，见 §6）。
- **禁止** 依赖远程 CI 做质量门禁 —— 本仓库 GitHub Actions 仅部署 Swagger Pages，不跑测试/构建；门禁一律在本地经 `bun run ci`（pre-push 强制，见 §4.8）。

## 4. 使用规范

### 4.1 运行时与脚本（Bun）
- 本地运行只通过 `package.json` scripts，不裸调 `bun src/main.ts`（会绕过 i18n/模块加载顺序约定）。
- 服务端口 **7009**，全局前缀 `/api`，URI 版本 `v1`（如 `POST /api/v1/users`）。
- 常用：`bun install`、`bun run start`、`bun run start:dev`（--watch）、`bun run build:nest`。

### 4.2 TypeScript / 构建
- `target`/`module` = `ES2022`，`moduleResolution` = `node`。
- **必须** 同时开启 `experimentalDecorators` 与 `emitDecoratorMetadata`（Nest DI / ValidationPipe 依赖）。
- 构建走 SWC（快）而非 tsc emit；类型检查由 `nest build` 内嵌 TSC 完成（目标 0 issues）。
- `*.test.ts` 不得进入 `dist`（`tsconfig.build.json` 已 exclude）。

### 4.3 装饰器元数据与导入形态（关键陷阱）
- **Controller 的 DTO**：出现在 `@Body/@Param/@Query` 参数位置时必须**值导入**（`import { CreateUserDto }`），否则 `design:paramtypes` 退化为 `Object`，ValidationPipe 静默跳过校验。
- **被构造函数注入的类/Provider**（如 `@nestjs/cqrs` 的 `EventBus`/`CommandBus`/`QueryBus`、全局的 `DrizzleService`）：使用**值导入 + 显式 `@Inject(Class)`** token；仅靠类型注解的隐式注入在 `import type` 下会于**运行时启动**才暴露 `UnknownDependenciesException`。
- 上述两类文件依赖 §5 的 Biome 豁免，防止 auto-fix 回滚。

### 4.4 数据库（Drizzle）
- 迁移流程：改 `src/database/schema` → `bun run drizzle:generate` → 审 SQL → `bun run drizzle:migrate`。
- 本地快速同步可用 `bun run drizzle:push`（无 TTY 环境需 `--force`），**仅限 dev**。
- `db:seed` / `db:reset` / `db:setup` 为数据准备入口；Postgres 由 `docker compose` 供给。

### 4.5 测试（Vitest）
- 命令：`bun run test`（run）、`test:watch`、`test:cov`。
- 用例放被测模块同级 `*.test.ts`；`include` = `src/**/*.test.ts`。
- 遵循既有规范：动态 `import` 必须 `await`；`env` 段提供最小必需环境变量；`testTimeout/hookTimeout` = 20s（全量 DI 图冷启动慢）。
- DI/元数据相关改动须保留 `Reflect.getMetadata('design:paramtypes')` 回归测试与全图 `app.module.test.ts`。

### 4.6 API 文档
- 运行 `bun run openapi:export`（需服务在 7009 在线）导出 `openapi/openapi.yaml`。

### 4.7 代码库智能（fallow）
- **定位（关键）**：fallow 是**前置分析 / 候选生成工具**——它输出的是**待核验的线索，不是可直接执行的判决**。任何结论（尤以 dead-code、未用依赖、边界告警）在据此**动手**（删代码、删依赖、重构）之前，**必须进行二次人工核验**。
- **为何必须复核**：fallow 基于静态仓库图，无法感知**运行时反射与框架魔法**调用，故必然存在假阳性与漏判。
- **二次核验（强制流程）**：
  1. `bunx fallow dead-code --type-aware` 收敛候选；
  2. `bunx fallow dead-code --trace <入口>:<符号>` 追踪引用链；
  3. 全仓 `grep`（含非 `.ts`、配置、注释、动态 import）反查；
  4. 处置分级：**真实问题**→修复；**假阳性**→加 `// fallow-ignore-next-line <issue-type>` 抑制并留因由；**存疑**→保留并记录。
  5. 删依赖/删码后跑 `check` + `test` + `build:nest` + 启动冒烟回归。
- **本项目已实证的假阳性类型（勿据此删除）**：
  - `@nestjs/cqrs` 总线反射调用的 `@CommandHandler/@QueryHandler` 的 `execute`、`@EventsHandler` 的 `handle`；
  - 经实例/`this` 调用但静态图漏判的公共方法（实证：`User.toPublicProjection` 实际被 handler 调用却被报为未用）；
  - 注释内出现的 `import` 关键字（fallow 正确判为未引用，但人工 grep 需排除注释造成的反向误判）；
  - DI 容器注入、装饰器元数据、动态 `require` 等运行时依赖。
- **调用方式**：统一经 `bunx fallow ...`（遵守 §3「禁 npm/pnpm/yarn」红线），不直接用 `npx`。
- **入口命令**：`bunx fallow`（健康/重复/未用一次跑完）、`bunx fallow audit`（仅卡本次变更引入的问题，PR 门禁首选）、`bunx fallow dead-code`、`bunx fallow dupes`、`bunx fallow health --score`。
- **架构边界**：`bunx fallow architecture` / `fallow guard` 提供 layered/hexagonal/feature-sliced 预设，作为 §4（architecture.md）分层依赖规则的**静态佐证**（同样需人工确认，非唯一门禁），与域纯度测试互补。
- **版本一致性**：当前仅全局安装（`3.33.1`，未入 `package.json`）。若需 CI/本地同版本，应固定为 devDependency 并在 `package.json` 写精确版本；在此之前，本工具为**推荐**而非强制门禁。
- **退出码约定**：`0` 干净/仅告警，`1` 发现新增问题（正常门禁结果），`2` 输入或运行错误——脚本化时不得用 `|| true` 掩盖 `2`。

### 4.8 本地 CI（Local CI）
- **定位**：本项目**不走远程 CI 做门禁**（GitHub Actions 仅部署 Swagger Pages）。质量门禁在**本地**由 `scripts/ci.ts` 一键执行，等价替代远程 CI。
- **命令**：`bun run ci`（full，默认）—— 依序跑 `check` → `build:nest` → `test` 三道**硬门禁**（快速失败），随后 `bunx fallow architecture` 作**佐证**（非阻断）；`bun run ci:quick` 仅跑 `check` + `test`（跳过 build 与 fallow，供快速回归）。pre-push 固定走 full。
- **自动触发**：`.husky/pre-push` 在 push 前执行 `bun run ci`；未全绿则阻断 push。禁止 `--no-verify` 绕过（§3）。
- **失败语义**：任一硬门禁非零退出 → 整体 `exit 1`；fallow 步骤即便有发现项或工具缺失也仅告警、不使流水线失败（遵循 §4.7「结论须二次人工核验」）。
- **可复现性**：编排仅用 Bun Shell（`import { $ } from 'bun'`），不引入 bash/Make 等其他编排工具，遵守 §1「运行时统一 Bun」。

## 5. Biome 规范

- 命令：`bun run check`（校验）、`check:fix`/`lint:fix`/`format`（写回）。pre-commit 触发 `lint:fix`。
- **必须保留的豁免**：`overrides` 中对 `**/*.controller.ts`（及按 §4.3 含 DI 的 provider/handler 路径）关闭 `style/useImportType`，避免把值导入擦成 `import type`。
- `files.includes` 保留 `!drizzle/**`、`!.claude/**` 等生成/工具目录排除。
- 提交前 `bun run check` 须 **0 errors**。

## 6. Git 与提交规范

- **身份**：使用内联身份提交，不改全局配置 ——
  `git -c user.name='FDE Team' -c user.email='fde.team@example.com' commit ...`
- **类型**：遵循 Conventional Commits —— `feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf` / `build` / `ci`。
- **格式**：header ≤100；body 每行 ≤100（受 commitlint `body-max-line-length` 约束）；长行手动换行。
- **钩子链**：pre-commit → `bun run lint:fix`；commit-msg → commitlint。禁止 `--no-verify`。

## 7. 命令速查

| 场景 | 命令 |
|------|------|
| 安装依赖 | `bun install` |
| 启动/热更/调试 | `bun run start` / `start:dev` / `start:debug` |
| 构建 | `bun run build:nest` |
| 校验/修复 | `bun run check` / `check:fix` |
| 测试/监听/覆盖 | `bun run test` / `test:watch` / `test:cov` |
| 迁移生成/执行/同步/Studio | `drizzle:generate` / `drizzle:migrate` / `drizzle:push` / `drizzle:studio` |
| 数据 seed/reset/setup | `db:seed` / `db:reset` / `db:setup` |
| OpenAPI 导出 | `bun run openapi:export` |
| 代码库健康/审计（fallow） | `bunx fallow` / `bunx fallow audit` / `bunx fallow dead-code` |
| 本地 CI（全量门禁，pre-push 自动触发） | `bun run ci` |
| 本地 CI（快速：仅 check+test） | `bun run ci:quick` |

## 8. 升级策略

- 升级走单一 PR/提交，附带 `bun run ci`（= check + build:nest + test 三关全绿）+ 启动冒烟全绿。
- 优先最新稳定版；`@types/*` 与实际运行时主版本对齐。
- 任何"同类工具替换"（如换 Lint、换测试运行器）须先修订本规范 §2/§3 并评审后再动。
