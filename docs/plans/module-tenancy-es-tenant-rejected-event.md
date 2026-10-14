# 技术方案 · reject 驳回事件接入 event store（第四切片 · 治理事件面收口）

> 状态: **已验收·结项**（审计：人直批·§6 零未决；实现 commit `a3fe6e7`；验收 2026-10-14）| 读者: **Agent**（历史执行记录）
> blast radius: **module**（tenants reject 单 handler + core 一个事件类）
> 关联: [module-tenancy-es-lifecycle-events §6-①](./module-tenancy-es-lifecycle-events.md)（本切片关闭其留口·并修正其裁决理由）· [event-sourcing-roadmap](./event-sourcing-roadmap.md) Phase B

## 1. 背景与现状（实测 2026-10-14 · 含误判忠实修正）

- **修正声明**：第二切片 §6-① 曾裁「reject 事件化需动 §9.4 迁移表、属行为变更、另开切片」。本轮勘察读码坐实该判断**有误**——`RejectTenantCommandHandler` 走的是 `provisioning.remove(organizationId)` **硬删路径**（pending 期零业务数据·FK 级联清 member/invitation），**全程不经过 `transition()` 状态机**。事件化因此无需动迁移表、不改任何裁决行为，范围比原判断小得多。原 §6-① 原文按「历史照实」保留不回改，修正记于本切片。
- **真审计缺口**：驳回成功后组织行被物理删除——该租户的**存在过的事实从此只剩结构化日志**（PlatformAuditService），event 表零痕迹。影子追加体系里唯一「行没了、事件还在」的入口就是这里；不补，驳回类治理动作不可追。
- 其余治理面已收口：`tenant.status.transitioned`（approve/suspend/resume/delete）、`user.status.transitioned`、`user.registered`。

## 2. 目标 / 非目标

**目标**：驳回成功（`removed === true`）产出 `tenant.rejected` 事件耐久落 `event` 表（shadow append·沿用全部既有端口/开关/发布器）。

**非目标**：改 reject 裁决行为（pending-only 域、409/404 语义原样）；`transition()` 状态机与 §9.4 迁移表零改动；not-found / 409 分支发事件（无事实不发）；用户侧删除事件化（**刻意不发**——PIPL 语义下删用户须连事件一并抹净，发即自相矛盾）。

## 3. 设计

- `DOMAIN_EVENTS` 新增 `tenantRejected: 'tenant.rejected'`（独立事件名而非复用 transitioned——驳回是删除事实而非状态迁移，语义须可区分）。
- 新事件类 `packages/core/src/tenancy/lifecycle/events/tenant-rejected.event.ts`：`AGGREGATE_TYPE='tenant'`（与 tenant.transitioned 同流·version 连续）、payload `{ actorId?, reason? }`。**PII 边界**：不携 name/slug——驳回即应抹掉申请内容，事件只证明「该 orgId 于何时被何人驳回」这一审计事实。
- 发布点在 **handler**（`removed===true` 后）：注入 `DOMAIN_EVENT_PUBLISHER`（显式 @Inject + 值导入·S9）；不在 TenantStatusService——reject 本就不经它。发布失败连带 500（宁缺勿错发·与全系列同语义）；`removed===false`（404 路径）零发。
- RejectTenantCommand 实测只有 `(organizationId, operatorId)`、**无 reason 字段**→ 本切片 payload 实际仅 `{ actorId }`（事件类接口保留 `reason?` 向后兼容位）；给命令加入参会动 controller/DTO 契约，**不在本切片范围**，留待需要时另开。

## 4. 风险与回滚

- 无 schema 变更不触高危#1；无删码不触高危#2；开关/回滚形态与第三切片完全一致（revert 单 commit）。
- reject 现有测（409/404/成功三径）断言零改动，仅成功径 + 事件发布断言。

## 5. 完成判据（DoD）

- [x] handler 单测：`removed=true` 发一事件（信封/payload 忠实·不携 PII 键）；409 与 not-found 零发；发布失败 fail-loud（测面 3→4）
- [x] `DOMAIN_EVENTS` 契约测覆盖 `tenant.rejected`（三点锁 + 同 tenant 流 AGGREGATE_TYPE 断言）
- [x] CI 全绿（**273 passed / 10 skipped**·基线 271/10 +2）·双包 tsc 0·fallow 边界 0；无新迁移
- [x] roadmap Phase B 回灌「治理事件面收口」；README 单源同步；提交 + push

## 6. 审计记录

**无开放未决项**——§6-① 误判的修正本身即本切片的立项依据；设计三要素（独立事件名/handler 发布点/PII 边界）论证见 §1–§3。

审计结论：2026-10-14 用户「同意」直批，放行实现（起草期已坐实命令无 reason 字段，§3 同步修正）。

- 2026-10-14 v0.1: 初稿（待审计·含 §6-① 误判修正声明）。
- 2026-10-14 v0.2: 实现完成——core（常量+事件类）+ handler 发布点；测 +2（fail-loud/契约同流）；CI **273/10**·边界 0·无新迁移。零未决；起草期已坐实命令无 reason 字段并修正 §3（非实现期新发现）。
- 2026-10-14 v0.3: 经人「同意，继续」指令视同**验收通过·结项**（commit `a3fe6e7` 已在远端）。治理事件面就此收口；Phase B 后半（同事务化/rehydrate）待人择向后开专项方案。
