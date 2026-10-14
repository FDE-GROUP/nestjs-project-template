# 技术方案 · 租户生命周期事件接入 event store（第二切片 · 含 PIPL 级联补删 + dead-code 挂账顺路）

> 状态: **已审计**（人授权·Agent 自裁·可翻案，裁决见 §6）| 读者: **Agent**（开发依据）
> blast radius: **module**（tenancy 生命周期卡点 + users PIPL 删除路径 + 两处挂账顺路）
> 关联: [module-users-es-append](./module-users-es-append.md)（已结项·端口/表/开关全部复用）· [event-sourcing-roadmap](./event-sourcing-roadmap.md) Phase B · global-tenancy §10 挂账（dead-code 两项·v0.18.12）与 §6-④（PIPL 定向）

## 1. 背景与现状（实测 2026-10-14）

- `TenantStatusService.transition()`（`packages/core/src/tenancy/lifecycle/tenant-status.service.ts`）是租户状态迁移**唯一卡点**：严格迁移表裁决、返回 `previous` 供审计、写 `organization.metadata`。调用方 4 处：approve/resume（→active）、suspend（→suspended）、delete（→deleted）command-handler。**零事件产出**——治理动作只存在于 PlatformAuditService 的结构化日志，进程重启即不可追。
- reject-tenant handler **不走 transition()**（自实现 pending 校验 + 直写），迁移表亦无 rejected 边——本片不动其裁决行为。
- PIPL 硬删：`DeleteUserCommandHandler` 经 `users.remove(userId)`（FK cascade 管 account/session·consent 置 null），但 `event` 表中该用户的 `user.registered` 行**不会被任何机制删除**（event 表无 FK）——users 首切片 §6-④ 已定向：应用层显式补删、不依赖 FK。
- 可复用件（首切片已落地）：`event` 表（0009·aggregateType 无关通用）、`EVENT_STORE`/`DOMAIN_EVENT_PUBLISHER` 端口、`DefaultDomainEventPublisher` 双模开关、`DOMAIN_EVENTS` 常量 + 双向契约测模式。

## 2. 目标 / 非目标

**目标**：租户治理动作（approve/suspend/resume/delete）以领域事件形式耐久落 `event` 表（shadow append·语义与首切片一致：CRUD/metadata 仍是唯一真相源）；PIPL 用户硬删级联清除其 event 行；顺路收掉 v0.18.12 dead-code 挂账中可安全项。

**非目标**：同事务化、rehydrate/投影/快照（Phase B 后半/C）；reject 流程事件化（需动迁移表·见 §6-①）；用户级 suspend/resume（UserStatusService）事件化（见 §6-④）；`user.registered` 之外 users 事件扩充。

## 3. 设计

### 3.1 事件形状与发布点（core 仍框架无关）

- `DOMAIN_EVENTS` 新增 `tenantStatusTransitioned: 'tenant.status.transitioned'`。
- `transition()` 成功分支（kind==='ok'）构造 `DomainEvent` 信封：`aggregateType:'tenant'`、`aggregateId:organizationId`、`eventType` 上值、`eventVersion:1`、payload `{ from: previous ?? null, to, actorId?, reason? }`，经注入的 `DOMAIN_EVENT_PUBLISHER.publishAll([event])` 发布（**写成功后发**，与首切片"宁缺勿错发"一致；非事务窗口如实记注释）。
- 签名扩展：`transition(organizationId, to, options?: { actorId?: string; reason?: string })`——可选参·现有 4 调用方逐一传入 handler 已有的 operatorId/理由，非破坏。
- TenantStatusService 注入 `DOMAIN_EVENT_PUBLISHER`（值导入 + 显式 @Inject·S9 教训）；token 已随 @Global DatabaseModule exports，TenancyModule 装配零改动。
- 进程内 `@EventsHandler('tenant.status.transitioned')` 探针 handler：**不加**（无消费者·避免造需求）；事件名契约测双向锁加一条。

### 3.2 PIPL 级联补删

- `EventStore` 端口新增 `deleteByAggregate(aggregateType, aggregateId): Promise<number>`；`DrizzleEventStore` 实现（delete…where 双条件·返回删除行数）。
- `DeleteUserCommandHandler.remove` 成功后调 `deleteByAggregate('user', userId)`，Logger 补记行数；`EVENT_STORE` 直接注入（删除动作**不受** EVENT_STORE_ENABLED 开关控制——表在就要清，开关只管写入）。
- 单测锁：删除在 remove 之后、失败 fail-loud（PIPL 不留残迹·与"append 失败不进总线"同理反向）。

### 3.3 dead-code 挂账顺路（高危#2·逐项呈审）

- **收**：`TenantStatus`/`PlatformUserRow` re-export 冗余（纯 barrel 去重·零行为面）。
- **建议不收**：`StorageService.uploadFile`（service 门面方法·挂账原文所指）——它是参考模板通往 provider 契约 `uploadFile`（StorageServiceInterface + 5 provider 实现）的唯一服务门面入口，删门面则能力面断链；无业务调用方 ≠ 死码（模板库示例能力即产品）。留观察·见 §6-②。
- reflect-metadata test-only 观察项：不动依赖（属高危#3）·继续挂账。

## 4. 风险与回滚

- transition() 在 core：发布失败会连带 500——与首切片 handler 同语义，开关关闭时 publisher 仅进程内派发、无 append 失败面；回滚 = revert 单 commit（event 表不动·无新迁移）。
- payload 含 actorId（PII 最小化：仅 id 不携邮箱）；tenant metadata 其余键不进 payload。
- 无 schema 变更 → **不触高危#1**；删 re-export 属高危#2 → 审计门内呈人签核后执行。

## 5. 完成判据（DoD）

- [x] 治理迁移落租户事件真库往返绿（gated 追加 2 测·tenant 流 version [1,2] 递增·开关关时零落表由首切片发布器单测已锁）：**4/4 绿**
- [x] PIPL 删用户后其 event 行归零：handler 单测 3/3（顺序/NotFound 不删/purge 失败 fail-loud）+ gated 真库归零与定向作用域各一测绿
- [x] `DOMAIN_EVENTS` 双向契约测覆盖 `tenant.status.transitioned`；TenantStatusService 单测锁「ok 才发、illegal/not-found 不发」（+3 测）
- [x] re-export 冗余清除后双包 tsc 0 错、CI 全绿（**267 passed / 9 skipped**·基线 260/7 +7 单测 +2 gated）、build 0、fallow 边界 0
- [x] roadmap Phase B 回灌第二切片；README 单源同步；global-tenancy §10 挂账处置回灌；提交（Conventional Commits·显式 add）+ push

## 6. 审计记录

审计方式：沿首切片先例——**用户授权 Agent 自裁**（2026-10-14「同意」），归因归人、可翻案。

- ① reject 本片不事件化——**照建议裁否**：需动 §9.4 迁移表，属行为变更，另开切片。
- ② `uploadFile`——**裁保留为能力面**：挂账候选系 `StorageService.uploadFile` **门面方法**（实现期复核校正措辞），其为 provider 契约 `uploadFile`（interface + 5 provider）的唯一服务入口，删门面即断链；挂账改「观察项」。
- ③ payload 携 `actorId/reason`（可选）——**裁是**：治理审计最小充分信息，仅 id 不携邮箱。
- ④ 用户级 suspend/resume 事件化——**裁否·留第三切片**（与本切片§2 非目标一致）。

实现期忠实修正：无设计外偏差；挂账①的确切对象（门面方法而非 interface 本体）已在 §3.3/§6-② 校正措辞。

- 2026-10-14 v0.1: 初稿（待审计）。
- 2026-10-14 v0.2: 经人授权 Agent 自裁四项→**已审计放行**；高危#2 顺路项（删 re-export）已在本文档内呈签。
- 2026-10-14 v0.3: 实现完成——core（事件类/常量/端口 deleteByAggregate/transition 发布+opts）、适配+4 handler 传参+PIPL 补删、re-export 冗余已删（uploadFile 按 §6-② 保留）；单测 +7、gated +2（真库 4/4）、CI **267/9**·边界 0·无新迁移不触高危#1；挂账顺路处置回灌 global-tenancy §10。
