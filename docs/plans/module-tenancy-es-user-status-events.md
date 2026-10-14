# 技术方案 · 用户级生命周期事件接入 event store（第三切片 · suspend/resume 耐久化）

> 状态: **已验收·结项**（审计：人直批·§6 零未决；实现 commit `3b6f0b1`；验收 2026-10-14）| 读者: **Agent**（历史执行记录）
> blast radius: **module**（tenancy 用户状态卡点 + 2 个治理 handler）
> 关联: [module-tenancy-es-lifecycle-events](./module-tenancy-es-lifecycle-events.md)（已结项·其 §6-④ 预告的本切片）· [module-users-es-append](./module-users-es-append.md)（已结项·同流 PIPL 覆盖）· [event-sourcing-roadmap](./event-sourcing-roadmap.md) Phase B

## 1. 背景与现状（实测 2026-10-14）

- `UserStatusService.transition()`（`packages/core/src/tenancy/lifecycle/user-status.service.ts`）是平台级用户暂停/恢复的**唯一卡点**（复用 §9.4 状态机的 active/suspended/deleted 子集·落 `user_status` 表），签名已带 `opts?: { reason?: string }`。调用方仅 2 处：suspend-user handler（携 reason）、resume-user handler（无 opts）。
- 治理动作与租户侧同病：`previous` 只进 PlatformAuditService 日志，**零事件产出**——平台对用户动权力，事件层却是空白。
- 妙处（本切片核心设计依据）：事件的 `aggregateType` 取 **`'user'`**——与首切片 `user.registered` **同聚合流**，version 按 `(user, userId)` 连续递增（registered=1 → suspended=2 自然成立）；PIPL 硬删的 `deleteByAggregate('user', userId)`（第二切片已落）**天然覆盖新事件类型，零额外删除代码**。

## 2. 目标 / 非目标

**目标**：suspend/resume 迁移成功产出 `user.status.transitioned` 事件，经既有双模发布器耐久落 `event` 表（shadow append·`user_status` 表仍是唯一真相源）；actorId 进 payload。

**非目标**：租户侧任何改动（已结项）；Phase B 后半（同事务化/rehydrate）；`USER_STATUS.DELETED` 的第三个调用方（不存在——平台删用户仍走 users 上下文 PIPL 硬删路径，不经此状态机，勿混淆）；新事件消费者/handler（无需求不造）。

## 3. 设计

### 3.1 事件与发布点（与租户切片完全对称）

- `DOMAIN_EVENTS` 新增 `userStatusTransitioned: 'user.status.transitioned'`。
- 新事件类 `packages/core/src/tenancy/lifecycle/events/user-status-transitioned.event.ts`：`AGGREGATE_TYPE='user'`（刻意与 UserRegisteredEvent 同流）、payload `{ from: UserStatus|null, to: UserStatus, actorId?, reason? }`。
- `UserStatusService` 构造注入 `DOMAIN_EVENT_PUBLISHER`（显式 @Inject + 值导入·S9）；`transition` 的 `opts` 扩为 `{ reason?, actorId? }`，ok 分支 upsert 成功后发布（写先发、发布在后·失败连带 500，与租户切片同语义）；not-found/illegal 零发。
- 2 个 handler 传入 `actorId: command.operatorId`（suspend 已传 reason，一并核正）。

### 3.2 装配面

`UserStatusService` 与 `TenantStatusService` 同由 TenancyModule 提供、token 随 @Global DatabaseModule exports 解析——**零模块装配改动**（与第二切片相同）。

## 4. 风险与回滚

- 无 schema 变更 → 不触高危#1；无删码 → 不触高危#2；开关语义复用 `EVENT_STORE_ENABLED`（关闭时仅进程内派发·与基线等价）。
- 回滚 = revert 单 commit；event 表数据纯追加无害。
- version 同流带来的唯一键风险：`(user, userId, version)` 由既有唯一键与适配器 max+1 兜底（真库往返测锁 registered→suspended 连续 2 版本）。

## 5. 完成判据（DoD）

- [x] TenantStatus 同款单测四断言：ok 才发 / not-found·illegal 不发 / payload 忠实（含 actorId/reason）/ 发布失败 fail-loud（+3 测）
- [x] `DOMAIN_EVENTS` 契约测覆盖 `user.status.transitioned`（常量⇄类⇄线上值三点锁 + **同流不变量断言**：AGGREGATE_TYPE === UserRegisteredEvent.AGGREGATE_TYPE）
- [x] 2 个治理 handler 测更新（transition 传参断言含 actorId）
- [x] gated 真库往返 +1：同 userId registered→transitioned version 连续 [1,2]·`deleteByAggregate('user', id)` 一并归零：**真库 5/5 绿**
- [x] CI 全绿（**271 passed / 10 skipped**·基线 267/9 +4 单测 +1 gated）·双包 tsc 0·build 0·fallow 边界 0；roadmap/README 回灌；提交 + push

## 6. 审计记录

**无开放未决项**——设计决策完备（对称性由第二切片先例约束，aggregateType 同流取舍见 §1）。审计点即方案本身：批准→实现，驳回→改稿。

审计结论：2026-10-14 用户「同意」直批（无未决项无须自裁），放行实现。

- 2026-10-14 v0.1: 初稿（待审计）。
- 2026-10-14 v0.2: 实现完成——core（事件类/常量/服务发布+opts.actorId）+ 2 handler 传参；单测 +4、gated +1（真库 5/5·同流 [1,2] 坐实）；CI **271/10**·边界 0·无新迁移。零未决零忠实修正（对称性设计完整成立）。
- 2026-10-14 v0.3: 经人「继续」指令视同**验收通过·结项**（commit `3b6f0b1` 已在远端·工作区净）。后续切片：[module-tenancy-es-tenant-rejected-event](./module-tenancy-es-tenant-rejected-event.md)（待审计·含对本系列 §6-① 的误判忠实修正）。
