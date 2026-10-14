# 调研：chuanghiduoc/nestjs-fastify-nx 借鉴评估

> 受众: **人 + Agent** | 性质: **参考、非依据**（`AGENTS.md` 权威层级；结论入 plan 须经审计门）
> 关联: [plans/microservice-readiness.md](../plans/microservice-readiness.md) · [plans/event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md)
> 取证日期: 2026-10-14 · 取证面: README + docs/architecture.md + docs/scaling-to-services.md（**未 clone 实机核验**，其声明为 README 级证据）

## 1. 对象概况

NestJS 11 + Fastify 5 + **Nx 23** monorepo boilerplate，自我定位"production-grade"。与我们同源面：Nest+Fastify+PostgreSQL+Vitest+Better-Auth（cookie 会话、非 JWT）+ DDD/CQRS 垂直切片 + pino。差异面（撞我方红线，见 §4）：Prisma / pnpm+Node / ESLint+Prettier / Nx / Webpack / EventEmitter2 / Sentry 全家桶 / GraphQL。

结构：4 个可部署单元（api / worker / scheduler / migration）+ `libs/{modules,core,infra,contracts,shared,testing,api-client,composition}`；9 个限界上下文（users, audit-log, upload, organizations, api-keys, notifications, feature-flags, terms, sessions）；**单库共表**。

## 2. 高价值借鉴点（按命中我方挂账排序）

### 2.1 触发器式拆分判据 + 三阶段路线（命中：微服务就绪度）

- **判据**：9 上下文共库共部署时拆分仍是亏的；**触发器满足才拆**——①上下文需独立扩缩容轴 ②≥2 团队互相阻塞发布 ③需独立 SLA/发布节奏 ④合规要求数据隔离。
- **Stage 1 只拆运行时不拆数据**（可逆）：新 app 复用同样的 libs，仅加部署目标/compose 服务，应用代码零改动。
- **Stage 2 挑「无入向外键」的边缘上下文拆数据**：audit/upload/notifications 是候选；**api-keys 明确不拆**（在每条机器请求的鉴权路径上，跨网络纯亏）。
- **Stage 3 最后拆 core**（users/auth）：Better-Auth 在 Nest 请求管线外写库、outbox trigger 挂在 core 表上，拆它需 saga 补偿替代跨上下文事务——正确性最先崩的地方。
- **表所有权纪律**：每上下文仓储只碰自己的表；跨上下文外键**只允许指向 core**，feature↔feature 禁止；对 core 的引用列（`userId`）**不带 FK**（允许 scheduler 在用户删后仍清理对象）。

### 2.2 事务性 Outbox（命中：ES Phase B 设计补强）

其事件流：域变更写 PG → **Postgres trigger 同事务写 `outbox_events`** → 默认进程内 EventBus 立即派发（非耐久）→ 耐久副作用（email/audit）投 BullMQ（崩溃可存活·DLQ）→ worker 消费。`EVENT_PUBLISHER_DRIVER=outbox` 开关切到 relay 轮询耐久发布。四个可直接移植的机制：
1. **同事务原子性**（域行与事件行同生共死，避免 dual-write）；
2. **事件名集中常量 + 契约测试锁死**（`DOMAIN_EVENTS` 与 trigger SQL 由 spec 双向锁定）；
3. **envelope 版本化**（`OUTBOX_SCHEMA_VERSION`，relay **拒收**比自己新的信封而非猜）；
4. **消费者幂等为硬要求**（publish 成功但 mark-processed 失败必重投）。

### 2.3 RFC 9457 错误契约带稳定 code（命中：我方已记录短板）

2xx 直返资源（Stripe 风格）；错误统一 `application/problem+json` + **稳定错误码** + 校验失败与业务规则失败共用扁平 `errors[]`；每响应 `X-Request-Id` 关联日志/trace。我方 `ErrorResponse` 无业务码字段（repowiki 已记为局限），可在**保形**前提下增量扩展。

### 2.4 其余即取即用项

- **CodegenAppModule**：HTTP-only 的 OpenAPI 导出专用装配（剔除 socket/监听器/副作用），解决我方 `openapi:export` 需先起服务监听 7009 的痛点；
- **Stripe 风格游标分页**：cursor 编码 + `has_more` 形状，offset 为例外——我方列表端点分页规范参照；
- **Testcontainers（PG+Redis）集成测试**：真库测试 CI 自动拉起，对应我方「全栈 CI 拼 PG」专项与手工 `nestjs_e2e` 库的痛；
- **worker/scheduler/migration 独立部署单元**：迁移作一次性 job 镜像（对齐我方生产 `generate+migrate` 口径）、耐久副作用走队列；
- **提取 checklist**（八项）：表所有权 / 入向依赖只走事件或显式 API / 事件入契约常量 / 消费者幂等 / 监听器 `safeParse` 不 cast / health probe 分层 / 新 scope tag 过边界测试 / 剪枝 package.json 能起镜像。

## 3. 与我方现状的对照（它已有·我方对应物）

| 它的机制 | 我方现状 |
|---|---|
| `@nx/enforce-module-boundaries` 阻断跨上下文 import | fallow architecture guard + 矩阵测试（等价目的·0 违规） |
| 进程内 EventBus 默认 + outbox 耐久开关（双模） | Phase A 纯进程内（`发而不存`），无耐久通道 |
| 每上下文表所有权 + FK 纪律 | S2 仓储唯一卡点（`requireTenantId`）·表所有权未成文纪律 |
| 五层安全流水线 + 镜像加固（digest 钉版/non-root/tini/SBOM/Cosign） | 我方仅 Dockerfile 基础形态（可列未来评估·非本期） |
| Lefthook + commitlint + 远程 CI | husky + commitlint + **L1 本地 CI** 哲学（`bun run ci` + pre-push） |

## 4. 不借鉴（红线冲突 / 已裁）

- **Prisma 7**（铁律 Drizzle+PG）；**pnpm/Node 24/Nx/Webpack**（铁律 Bun + nest build SWC；bun workspaces 够用）；**ESLint 10 + Prettier**（铁律 Biome）；
- **Sentry/OTel/Prometheus 全家桶**（D6 已裁：不引入集中监控）；**GraphQL (Mercurius)** 三面 API（超范围）；**EventEmitter2**（我方 `@nestjs/cqrs` EventBus）；
- 五层安全流水线与远程 CI 门禁：**非不对**，而是与「L1 本地 CI + 单人决策链」的节奏不匹配，若团队化再评估。

## 5. 结论

借鉴的是**机制与判据**（触发器式拆分、outbox 四件套、错误码契约、codegen 模块、表所有权纪律、提取 checklist），不是工具链。落点归 [plans/microservice-readiness.md](../plans/microservice-readiness.md)（待审计）与 event-sourcing-roadmap Phase B 补强。本文保持「参考、非依据」地位。
