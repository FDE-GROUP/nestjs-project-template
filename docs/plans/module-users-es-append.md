# 技术方案 · users 上下文 ES 首切片（event store 影子追加）

> 状态: **已验收·结项**（审计：人授权·Agent 自裁·§6；实现 commit `fab6ffd`；验收 2026-10-14）| 读者: **Agent**（历史执行记录）
> blast radius: **module**（users 上下文 + shared-kernel 端口 + 新增 additive 表）
> 关联: [event-sourcing-roadmap](./event-sourcing-roadmap.md) Phase B（本切片为其**首切片细化**）· research/nestjs-fastify-nx-review §2.2（事件名常量 + 契约锁机制）· 记忆「ES 与 EDA 经人澄清升格为确定的架构目标」

## 1. 背景 · 目标 · 非目标

**背景**：ES/EDA 已升格为确定架构目标（人澄清 2026-10-14），roadmap 仍为方向性文件、粒度不足以直接开工。本切片把 Phase B 的第一步细化到可审可执行。

**目标（Shadow Append，影子追加）**：点亮 `event` 表——users 上下文的领域事件在**现有 CRUD 写路径保持不变**（CRUD 仍为唯一真相源）的前提下，**同请求内耐久追加**一份 ES 形状的事件行，作为未来回放/审计/投影的原料。这是 roadmap「写路径切换」的**安全前半步**：不动读侧、不回放、不改状态语义。

**非目标（本切片明确不做）**：
- ❌ 回放 / `rehydrate` 切换真相源 / 投影 / 快照（roadmap Phase B 后半与 Phase C）
- ❌ outbox 表与跨进程 relay / broker（单进程无跨边界需求；机制②③先行，见 §2.4）
- ❌ upcaster（`eventVersion` 列已预留）
- ❌ 其余上下文（tenancy/subscriptions 等）接入——判据满足后另开切片

## 2. 设计（决策完备 · 审计时逐条裁）

### 2.1 `event` 表（Drizzle 迁移 0009 · 纯 additive · 高危#1）

按 roadmap Phase B SQL 原样落表（列名/约束逐一对齐）：`id bigserial PK`、`aggregate_id text`、`aggregate_type text`、`version int`（聚合内序列）、`event_type text`、`event_version int`、`payload jsonb`、`metadata jsonb?`、`occurred_at timestamptz`、`created_at timestamptz default now()`、**UNIQUE (aggregate_type, aggregate_id, version)**。表名取 **`event`**（与 roadmap 一致·若人裁改 `event_store` 以裁为准）。流程硬约束：`generate` → **人审 SQL** → `migrate`（dev）→ `drizzle:studio` 核对三方一致；禁 push。

### 2.2 端口倒置（core 零驱动·沿 S10 P1b 先例）

- `packages/core/src/shared-kernel/`新增 `event-store.port.ts`：`EVENT_STORE` Symbol + `EventStore` 接口（`append(events: readonly DomainEvent[]): Promise<void>`——纯类型，不引 Drizzle/Nest）。
- `apps/reference/src/database/`（或 infrastructure 适配位）新增 `DrizzleEventStore` 适配器：信封列 → `event` 表行（`correlationId/causationId` 等入 `metadata jsonb`）；唯一键冲突**如实抛错**（fail-loud，不静默吞）。
- 注册：`@Global` provider，`enabled` 由配置驱动（见 §2.5）；core 生产文件保持零 `@app/*`（fallow guard 锁）。

### 2.3 `DomainEventPublisher` 收口派发点（唯一被改的接缝）

- 新增应用级能力 `DOMAIN_EVENT_PUBLISHER`（参考 application 层定义端口·infrastructure 实现）：`publishAll(events)` = **① event store 启用则先 append → ② EventBus.publishAll（进程内派发无条件保留·EDA Phase A 语义不变）**。
- `CreateUserCommandHandler` 从直注 `EventBus` 改注 `DOMAIN_EVENT_PUBLISHER`——**users 一个 handler 是本切片唯一业务改动点**；`pullDomainEvents()` 时点、HTTP 契约、响应体逐字节不变。
- 顺序刻意 append-先于-publish：影子写失败则事件不进进程内总线（宁缺勿错发·审计流一致性优先）。

### 2.4 事件名集中常量 + 契约双向锁（借 research §2.2 机制②③·为未来 relay 预保真）

- core 新增 `domain-event-names.ts`：`DOMAIN_EVENTS = { userRegistered: 'user.registered' } as const`；聚合改用常量而非字面量。
- 契约测试锁双向：聚合产出的 `eventType` **必须**命中 `DOMAIN_EVENTS` 值集（枚举全量·防旁逸）；信封字段断言沿用既有 `user-registered.event.test.ts`。
- envelope 已含 `eventVersion`（列已建）；「relay 拒收更新信封」机制待 relay 存在时启用，本切片仅保证**数据形态可被拒收规则消费**。

### 2.5 配置开关（双模·默认关）

- `EVENT_STORE_ENABLED`（boolean·默认 `false`）入 `envs/` 契约 + Joi schema（沿现有 runtime 校验）；`false` 时 `DomainEventPublisher` 纯透传 EventBus（等价现状·生产零行为变化），`true`（dev/test）启用 append。
- 迁移未 apply 的环境误开 = append 抛错 fail-loud——故开关默认关 + 文档写明「先 0009 apply 后开」。

## 3. 测试口径（Vitest）

① `DrizzleEventStore` 适配单测：列映射/唯一键冲突抛错/空批 noop；② `DomainEventPublisher` 单测：enabled 先 append 后 publish、disabled 纯透传、append 失败不发总线；③ handler 单测改注入点（既有断言 `publishAll`→改断言 publisher）；④ 事件名契约测（§2.4）；⑤ env-gated 真库往返：开开关→注册→查 `event` 表行存在且列逐字节符合信封（无 `E2E_DATABASE_URL` 默认 skip·沿 S9 分层）；⑥ `bun run ci` 全绿 + fallow 边界 0（禁加豁免）。

## 4. 影响面与风险 · 高危命中

- 命中**高危#1**（迁移 0009·逐次人审 apply）；不触 #2（零删除）/#4（零守卫与豁免面变化）。
- 新表行含用户注册 payload（email 等 PII）→ **数据驻留红线**：`event` 表数据同主库受 CL-DR 约束，无需额外处理，但**删除语义**须在 PIPL 切片时一并裁决（用户硬删是否级联删事件行·登记 §6 未决④）。
- 写路径多一次 INSERT（注册频率低·非热点·性能风险可忽略）；影子追加与 CRUD **非同事务**（极端下可能域行在/事件行缺——本切片接受此弱一致并如实记录，升级为同事务属 Phase B 后半）。

## 5. 完成判据（DoD）

- [x] 0009 经人审 apply（2026-10-14 签核·`drizzle/0009_uneven_silverclaw.sql`），三方一致：journal 10 条（0000→0009）⇄ schema ⇄ dev 库（`event` 表 11 列 + pkey/双唯一键/流索引·public 表 12→13）
- [x] enabled=true 下注册流事件耐久落表：gated 真库往返 **2/2 绿**（信封→列忠实、version [1,2] 递增、重复 eventId fail-loud）；enabled=false 行为与基线等价（发布器单测锁）
- [x] `DOMAIN_EVENTS` 常量 + 双向契约测上线；`packages/core` 零 `@app/*` 保持；CI 全绿（**260 passed / 7 skipped**）、build 0、fallow 边界 0
- [x] roadmap 回灌：Phase B 标注「首切片已落地（shadow append）」；plans README 状态同步
- [x] 提交（Conventional Commits·显式 add）+ push（pre-push 跑 CI）

## 6. 审计记录

- 输入方案: 本文 | 审计方式: **用户授权 Agent 自裁（2026-10-14，归因仍归人、可翻案）** | 结论: **已审计 · 放行实现**（高危#1 迁移 SQL 另行逐次呈审）
- 四项未决裁决：**①** 首上下文 = users（钩子/信封/契约测全就绪；影子追加不动 CRUD 语义，与「identity 长期 CRUD」不冲突；tenants 接入留后片）；**②** `EVENT_STORE_ENABLED` 入全环境 envs 契约（default/development/production 全覆盖，不留游离读点）；**③** 表名 `event`（列名从仓库 camelCase 惯例，roadmap SQL 视为语义而非命名 SSOT）；**④** PIPL 级联缓裁·定向：用户硬删路径由应用层显式补删该 aggregateId 事件行（不依赖 FK，留至下个 PIPL 切片）。
- 审计改动（实现期发现的忠实修正）：领域信封 `eventVersion` 是 schema 版本 ≠ roadmap `version` 列（聚合内序号），信封首切片不动——`version` 由适配器按 `max+1` 取得；表补 `eventId text` 列保信封全量保真（roadmap SQL 遗漏，回灌 roadmap）。
- 关联风险: 高危#1（迁移 0009·SQL 逐次人审 apply）· 弱一致窗口（§4）· 无契约/守卫变更

## 7. 演变记录

- 2026-10-14 v0.1: 初稿——Phase B 首切片（shadow append）细化，含表/端口/发布收口/事件名锁/双模开关/六项测试口径（待审计）。
- 2026-10-14 v0.2: 经人授权 Agent 自裁四项未决→已审计放行（裁决与实现期忠实修正见 §6）；高危#1 迁移 SQL 仍逐次呈审。
- 2026-10-14 v0.3: **首切片实现完成**——17 文件（core 端口/常量、适配/发布器/handler 改注/envs 三段/schema+0009、+12 单测 +2 gated）；0009 经人签核 apply·三方一致；真库往返 2/2；CI 260/7·边界 0。遗留（非本片）：同事务化（Phase B 后半）、rehydrate/投影/快照（B 后半/C）、其他上下文接入、PIPL 级联补删（§6-④）。
- 2026-10-14 v0.4: 经人「继续」指令视同**验收通过·结项**（commit `fab6ffd` 已在远端·工作区净）。后续切片：[module-tenancy-es-lifecycle-events](./module-tenancy-es-lifecycle-events.md)（待审计）。
