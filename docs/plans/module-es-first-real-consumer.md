# ES 首个真实业务消费者：订阅联动（outbox 端到端兑现）

> 适用范围: `全局`（触 core 公共契约 · 跨上下文事件流 · 或 schema 迁移视裁点 A）| 性质: 初稿 · 候选稿
> 关联: `event-sourcing-roadmap.md` Phase B「rehydrate/投影待真实需求为门」· `module-es-outbox-transactional`（已结项·本片为其消费者兑现面）· `global-tenancy` S4/S5/S7（治理生命周期 + 订阅配额）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**outbox 已建而消费面全假**（前片结项现状）：`EVENT_TYPE_REGISTRY` 四类治理事件经 relay 投递后，全仓唯一 `@EventsHandler` 消费者是 `UserRegisteredEventHandler`（log no-op）；roadmap  declared 的「消费者幂等为硬要求」尚无真实兑现体。前片再裁决的成本（relay/运维）要产生收益，须接上第一个真实业务消费者。

**勘察实据（2026-10-17）**：

- 支付 webhook 的归一化分发点是**空转 switch**（`payment.controller.ts` `payment_intent.succeeded/failed` 两 case 仅注释+`break`，零状态写）；`NormalizedPaymentEvent`（provider/type/data/raw）与 `PaymentProvider.verifyWebhook` 通道无关归一已就位。
- **支付↔订阅存在建模缺口**：`payment_intent` 与 `tenant_subscription` 间无任何 link 字段（S7 create 仅落 `providerCustomerId`），webhook 到达时**无法定位订阅**——打通需新增链路建模（大概率触 schema·高危 #1）。
- 租户 suspend/resume 治理路径**完全不联动订阅**（grep 零命中）：suspend 的效果面 = TenantMiddleware deny-list 失能 + session 硬删；订阅行原样 active。
- 订阅语义 SSOT（`tenant-plans.ts`）：`SubscriptionStatus = 'active'|'expired'|'cancelled'`；「当前订阅 = 最新 active 行」；**无 active 行回落 `FREE_PLAN`（带限额·非 fail-open·S7 裁②）**；行态 1:N 历史（cancelled 不可逆，恢复=新开行）。
- subscriptions 领域层现状：core 内仅 CQRS application + ports（repository/customer-provisioner），**无聚合根、无领域事件**。

**目标**（择一或连做，裁点 A）：让 outbox→relay→消费者全链第一次承载真实业务动作，并以真实消费者兑现幂等硬要求（at-least-once 重投不产生重复业务效果）。

**非目标**：rehydrate 投影 / 快照 / 读侧切换（仍待真实回放需求为门）；broker 跨进程订阅；`user.registered` 遗留 seam 接通。

## 2. 方案

### 2.1 候选 scope（裁点 A 择定后细化）

- **甲 · 治理联动消费者**（零迁移候选）：tenancy 上下文 `tenant.status.transitioned` → subscriptions 上下文新增 `@EventsHandler`：suspend/resume/delete 时关闭当前 active 订阅行（状态值与效果见裁点 B），幂等按「最新 active 行」业务键收敛（重投天然 no-op）。消费者归**消费上下文** `modules/subscriptions/infrastructure/dispatchers/`（跨上下文只经领域事件·发布点零改动）。
- **乙 · 支付联动消费者**：webhook 验签后成为**第四个发布点**（`uow.run` 包「写 link 行 + append 事件」关键段）→ relay 投递 → subscriptions 消费者按事件推进订阅态。前置建模：`tenant_subscription` 加支付链路字段（`providerCheckoutId` 或独立 `payment_attempt` 表·**触高危 #1**）+ 新事件类型入 `EVENT_TYPE_REGISTRY`/`DOMAIN_EVENTS` 双向锁 + webhook 幂等（Stripe eventId 去重）。
- **丙 · 甲先行、乙另案**：甲兑现全链与幂等范式，乙作为独立专项另立案（建模缺口不并入本片防范围蔓延）。

### 2.2 机制要点（两候选共用）

- 消费者实现 `IEventHandler`，经 `@EventsHandler(EventClass)` 注册（`@nestjs/cqrs` 按类引用匹配·registry 重建实例保证同一类）；**幂等硬要求**：处置须对「同 eventId 重复投递」与「乱序/滞后事件」安全（业务键终态收敛优先于事件序号）。
- 默认态不变量：`EVENT_PUBLISH_MODE` 缺省仍 `inproc`（消费者在 inproc 直投与 outbox relay 投递两种派发通道下行为一致；gated e2e 以 `outbox` 模式跑真链对拍）。
- 事件契约：若甲涉 `payload` 需补字段（如 transition 前后状态已含则零改；缺则信封 additive 扩展 + 契约测更新·eventVersion 保 1 因纯 additive）。

### 2.2.1 治理档（丙档中的甲·先行切片）机制细案（裁后新增）

- **事件面零扩展**：`tenant.status.transitioned` payload 已含 `from: TenantStatus|null` / `to: TenantStatus`（+可选 actorId/reason）——消费者直读 `to` 裁决，不触 eventVersion。
- **订阅状态机扩一档**（裁点丙）：`SubscriptionStatus` union 新增 `'suspended'` + `SUBSCRIPTION_STATUS.SUSPENDED` 常量（core 契约·#4 已随签）。语义：suspended=**可恢复关闭**（resume 回 active），与 cancelled（不可逆终止·恢复新开行）并存不冲突；**quota 读面零改动**（`MikroQuotaStore.currentActiveSubscription` 仅滤 `status=ACTIVE`，suspended 行自然排除→回落 FREE_PLAN 带限额·非 fail-open）。
- **消费者映射表**（终态收敛式·天然幂等）：`to=suspended` → 当前最新 active 行置 suspended（无则 no-op）；`to=active`（resume/approve）→ 最新 suspended 行回 active（无则 no-op·不回溯历史 cancelled）；`to=deleted` → no-op（FK cascade 已保证行随租户硬删）；`to=pending` 理论不可达·no-op 留痕。重复/乱序投递收敛到同一终态，零业务键计数。
- **归属**：消费者居**消费上下文** `apps/api/src/modules/subscriptions/infrastructure/dispatchers/`（tenancy 发布点零改动·跨上下文只经领域事件）；订阅行写经 subscriptions 既有 repository 端口（不直 import 他上下文表）。
- **垂直切片**：S1 枚举扩展（tenant-plans + 常量 + 既有 quota 测保形）；S2 消费者 + 单测（幂等重投/乱序滞后/无 active 行三例）；S3 装配 + gated e2e（真链：suspend → outbox 行 → relay 投递 → 订阅行 suspended → resume → active）入 `GATED_E2E_FILES`；S4 文档三面。支付档（乙）另立 plan、另过审计门，不在本片 scope。
- **实现形态细化（执行新增）**：治理消费者**无目标租户请求上下文**（ALS `requireTenantId` 用户面卡点不可用）→ 新增**系统面端口** `SUBSCRIPTION_LIFECYCLE`（`convergeStatus(tenantId, from, to): Promise<boolean>`·与 `QuotaStore` 同侧同律：显式传 tenantId·来源=治理事件 `aggregateId` 可信单源），适配 `MikroSubscriptionLifecycle` 居应用侧；「有 from 行才写 to 态、无则零写 false」的**终态收敛契约**即幂等的物理支点（重投/滞后天然 no-op，无需 eventId 计数）。
- **e2e 观测口径（实跑踩坑登记）**：relay 对 `bus.publishAll` 是 **fire-and-forget**（与真实 `@nestjs/cqrs` 同步入队·handler 微任务执行语义一致），且 fork 继承的 ORM 缓存层对异连接写会吐 stale 实体——gated e2e 断言一律走 **raw SQL 轮询收敛**（本仓 DDL 列名 camelCase 需双引号标识符），不得即时断言。

### 2.2.2 附带机制统一：应用生成 id 切 UUIDv7（人裁 2026-10-17·「时间戳在高位、按字节排序≈按时间排序」）

- 实机核验 Node v22.23.0 **无原生** `crypto.v7id/uuidV7`（Node 24+ 才有）→ 零依赖手写 `uuidv7()`（RFC 9562 §4.2.3）居 `libs/core/src/shared-kernel/util/uuid-v7.ts` 单源；坑实录：`Date.now() & 0xffffffffffff` 被 JS 位运算截 32bit（契约测当场拦出），正解直接 `writeUIntBE(Date.now(), 0, 6)`。
- 替换面：全仓应用生成主键/信封 id 共 8 处（domain-event `eventId`、posts/workspaces/subscriptions 仓储、seed×3）——列型仍 text·**零迁移**；存量 v4 行与新 v7 行混存期，表内 id 序暂不可依赖（收敛排序仍走时间列 `periodStart/createdAt`），新写入已时序可排。契约测：形态/时间戳解码/字节序单调/千连发唯一。

### 2.3 裁点（审计门逐条已落判 2026-10-17）

- **甲**（scope）——**已裁：丙·甲先行乙另案连做**（治理联动消费者先落地；支付档含建模缺口另立 plan 另过审计门，本会话连做）。
- **乙**（业务真实性）——**已裁：成立**（租户被 suspend ⇒ 当前订阅关闭为真实商业规则；resume 后回 active）。
- **丙**（状态语义）——**已裁：新增 `'suspended'` 枚举**（可恢复语义贴切；触 core `SubscriptionStatus` union·高危#4 随丁签；勘察坐实 quota 读面仅滤 ACTIVE，新增枚举零读面改动，爆炸半径低于立案评估）。
- **丁**（高危面）——**已裁：照案签**（#4 契约 + 若含支付档 #1 迁移照裁点戊先例：Agent 执行 dev 库·生产留人）。

## 3. 影响面与风险

- **高危命中（视裁点甲）**：乙/丙含迁移 → #1；消费者若需事件 payload 扩展 → #4 core 契约；均须随审计门签。甲零迁移档最轻。
- **效果时序**：消费者为事件驱动**最终一致**（outbox 模式延迟=轮询间隔）；suspend 的即时失能面（deny-list/session 硬删）不依赖本消费者，商业面滞后可接受。
- **幂等失守风险**：若消费者写成「按事件计数变更」而非「终态收敛」，at-least-once 重投将产生重复行变更——判据测必须含重投幂等例。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计·人签核开工**（2026-10-17 AskUserQuestion 甲–丁逐裁：甲=丙档「治理先行·支付另案连做」·乙=商业规则成立·丙=新增 'suspended' 枚举·丁=照案签（#4 随签；治理档零迁移不触 #1））
- 未决项：支付档（乙）建模细节另立 plan 另过审计门，不在本片未决面内
- 审计人 / 日期：人（FDE·AskUserQuestion）· 2026-10-17

## 5. 完成判据（可核验 + 穷尽·裁后细化）

- [x] 消费者真实业务动作落库（gated e2e：发布点动作 → outbox 行 → relay 投递 → 消费者效果可见）——`tenant-status-subscription-link.e2e.test.ts` 4 例真库全绿×连跑零干扰；`GATED_E2E_FILES` 7→8
- [x] 幂等硬要求实证：同 eventId 重投 + 滞后/乱序事件均零重复效果（单测 + gated 真库 updatedAt 不动实证）
- [x] 默认态守护：`inproc` 缺省行为不变；DB-free 基线只增不减（393/25 → 404/29 实证）
- [x] （丙档甲面）零迁移——实属实：未新增 migration，`suspended` 落既有 text 列
- [x] `pnpm run ci` 全绿；`test:fullstack` 全绿零足迹（e2e 29 例）；Biome 净；文档三面（roadmap 消费者兑现留痕·README 索引·本节留痕）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | outbox 结项后择定下一主线（ES 自然延伸·真实消费者） | 首版：勘察实据（webhook 空转/建模缺口/治理不联动/订阅语义 SSOT）+ 甲乙丙 scope + 裁点甲–丁 |
| 2026-10-17 | 0.2.0 | 审计门过人签核 | 甲–丁逐裁留痕（甲=丙档先行连做·乙=规则成立·丙='suspended' 枚举·丁=照案签）；§2.2.1 治理档机制细案（事件面零扩展/消费者映射表/quota 零改动坐实/S1–S4 切片）；README 索引翻「已审计·进行中」 |
| 2026-10-17 | 0.3.0 | 治理档 S1–S3 实现完成 + 用户追加裁决 UUIDv7 | §2.2.1 补系统面端口实现形态与 e2e 观测口径（fire-and-forget/raw SQL）；新增 §2.2.2 UUIDv7 机制统一（8 处换轨·零迁移·位运算截断坑实录）；S1–S4 执行留痕 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.0 变更，以当前正文内容为准。
