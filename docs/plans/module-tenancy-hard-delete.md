# 技术方案 · 按租户硬删执行面（NFR-6 另一半 · 阶段 3 第二切片）

> 状态: **已实现·待验收**（人批准 2026-10-14·甲乙丙丁照建议·实现完成 CI **294/13**）| 读者: **Agent**（开发依据）
> blast radius: **module**（`modules/tenants` 写侧扩展·**零 schema 变更不触 migrate**——FK cascade 已在表定义内·不接全局 APP_GUARD）
> 关联: [global-tenancy](./global-tenancy.md) NFR-6（"按租户**删除**硬删执行面仍留后续"）/ S5 行「deleted 终态·保留行供按租户导出/硬删」· [module-tenancy-data-export](./module-tenancy-data-export.md)（取证闭环前置已就位）

## 1. 背景与问题

- NFR-6 的「导出」半已于 `110b884` 落地；「删除」半目前止步于**软删**（S5：`DeleteTenantCommand` → `deleted` 终态·行保留）。`deleted` 之后无执行面 = GDPR 被遗忘权按租户维度只完成"失能"未完成"消灭"。
- 软删设计时明笔「保留行供**按租户导出/硬删**」——导出已在，硬删缺位即闭环半断。
- 既有先例齐备：PIPL 用户硬删（`delete-user.command-handler`：`users.remove` FK cascade + `eventStore.deleteByAggregate('user', id)` 应用层补删·fail-loud 不留残迹）——租户侧完全同构可套。

## 2. 目标与非目标

**目标**
1. `DeleteTenantPermanentlyCommand` + handler（写侧 CQRS·入 tenants.module `CommandHandlers`）。
2. governance port 加 `destroy(organizationId)`：Drizzle adapter `DELETE FROM organization`——member/invitation/workspace/tenant_subscription/post **五表 FK cascade 自动消灭**（schema 已声明 `onDelete: 'cascade'`，零迁移）。
3. 租户 lifecycle 事件补删：`eventStore.deleteByAggregate('tenant', orgId)`（event 表无 FK·应用层显式清·同 PIPL 先例口径）。
4. 端点 `DELETE /platform/tenants/:id/permanent`（`PlatformTenantsController`·类级 `PlatformOperatorGuard` 已罩）。
5. **前置闸**：仅 `deleted` 终态可硬删（§6-甲）；不存在/已被硬删 → null→404（幂等语义）。
6. 结构化审计：`PlatformAuditService.logTenantGovernance('hard_delete', …)`（pino 机读留痕·在库外，硬删天然幸存）。

**非目标**
- ❌ 跳过软删直接硬删 active 租户（两段式安全：先 `@Delete :id` 软删再 permanent·§6-甲）。
- ❌ 强制"先导出后删"的技术闸门（HTTP 无状态做不到·留流程约束·§6-丙）。
- ❌ 新表/新列/迁移（cascade 已在·高危#1 不触）。
- ❌ 用户/成员账号的任何删除（自然人跨租户存在·只消灭租户归属行）。
- ❌ 批量/定时 purge（运营节奏留人工）。

## 3. 设计（决策完备）

### 3.1 接线（三段式·承导出片同款订正）

- **port**：`TenantGovernanceRepository` 加 `destroy(organizationId): Promise<boolean>`（返回是否实删）。形状与纪律注释明笔：仅限已 deleted 终态的运营消灭面，访问裁决在 controller guard。
- **adapter**：`DrizzleTenantGovernanceRepository.destroy` = `db.delete(organization).where(eq(organization.id, id))` returning id；无行 → false。五段子表由 DB FK cascade，应用层不逐表删（单一卡点）。
- **handler**：`DeleteTenantPermanentlyCommandHandler` 编排——① `governance.findById(id)`：null → 返回 null（controller 404）；status ≠ `deleted` → `ConflictException`（409·§6-甲）；② **先补删事件** `eventStore.deleteByAggregate('tenant', id)`（**不受 EVENT_STORE_ENABLED 开关控制**——表在就要清，PIPL 不留残迹·直注 `EVENT_STORE` + 值导入 + 显式 `@Inject`，同 user 先例 S9 教训）；③ **后删主行** `governance.destroy(id)`（顺序理由：若补删失败 org 仍在可整请求重试；若先删主行后补删失败，重跑会被 ① 的 404 挡死形成不可重试孤儿事件——机制性规避逐模块特判）；④ 审计成功/失败行。
- **controller**：`@Delete(':id/permanent')`（置于现有 `@Delete(':id')` **之前**注册或依赖 Fastify 静态段优先——路径不同首段无冲突，实证为准）；body 无；返回 `{ organizationId, purgedEvents }` 或 204（实现期按既有端点返回风格择同）。

### 3.2 零迁移声明

FK cascade 关系与 event 表结构均现成；不触 `drizzle:generate/migrate`（高危#1）；不动全局守卫（高危#4）。

## 4. 测试计划

1. **handler 单测**（mock port/eventStore·对齐 delete-user.command-handler.test 范式）：① 非 deleted 态 → 409 且不删；② 不存在 → null（不触发 destroy）；③ deleted → destroy+补删+审计成功行编排各一次；④ 补删抛错 fail-loud（不吞）。
2. **adapter 单测**：destroy 链形态（mock db·delete returning）。
3. **gated e2e**（建议做·与软删合一段真库坐实 cascade 实效）：建租+成员+post+subscription → 软删 → permanent → 断言六表 0 行 + tenant 事件 0 行 + user 行幸存（自然人不连带）。
4. boot 冒烟既有整树 DI 覆盖新 handler（S9 值导入纪律）。

## 5. 验收标准（DoD）

- [x] handler/adapter 单测绿（5+2：409 前置闸/幂等 404/顺序契约/fail-loud/并发窗口 + destroy 链两面）；
- [x] gated e2e 真库坐实六表 cascade + 事件补删 + user 幸存 + 重复硬删 404 + active 409（真库 2/2 绿·默认 CI skip）；
- [x] `bun run ci` 全绿（基线 287/11 → **294/13**）·fallow 边界 0 违规；
- [x] global-tenancy NFR-6「删除半兑现」回灌 + S5 行后记 + plans/README 结账。

## 6. 未决事项（待人裁·附建议）

- **甲 · 前置闸**：硬删仅允许 `deleted` 终态（其余态 409·两段式：先软后硬）？——**建议：是**。理由：不可逆操作设人工缓冲；`deleted` 本就是"保留行供导出/硬删"的待消灭状态；误删 active 租户无回退路径。
- **乙 · 事件面**：硬删时补删 tenant lifecycle 事件（`deleteByAggregate('tenant', id)`）？——**建议：补删**，与 PIPL 用户硬删先例同口径（不留残迹）；审计留痕由 pino 机读日志承担（S5 起即「不落新表」设计，硬删幸存）。若裁保留，事件成为租户曾存在的残留指纹，与被遗忘权取向冲突。
- **丙 · 技术性强制导出**：是否在 handler 层强制"先导出"凭证？——**建议不做**。导出/删除是运营侧两独立动作，HTTP 无状态无法证明操作员已导出；流程留痕靠审计日志。留观察项。
- **丁 · 返回体**：`{ organizationId, purgedEvents }` 200（信息量利于审计核对）vs 204 空——**建议 200+purgedEvents**（对齐补删可核对语义）。

## 7. 风险与回退

- **不可逆数据消灭**是本切片交付物的固有属性：运行时防线 = 前置闸（甲）+ 全局唯一 operator guard + 审计留痕；代码层无高危数据暴露（纯执行面接线）。
- event 补删 fail-loud：编排采**先补删事件后删主行**（§3.1），任意一步失败均可整请求重试不留不可达残迹；补删返回的 `purgedEvents` 计入审计与响应供核对。
- 回退：新端点独立，revert 即净退。

## 8. 演变记录

- 2026-10-14 v0.1: 依人裁「1」立项起草。取证坐实：软删现状（transition→deleted·`@Delete(':id')` 已占）；六表 FK cascade 声明齐备（member/invitation/workspace/subscription/post→organization·onDelete cascade）；tenant 事件 `AGGREGATE_TYPE='tenant'`；PIPL 用户硬删先例（remove+deleteByAggregate·EVENT_STORE 直注不受开关控制）；PlatformAuditService pino 留痕幸存。§6 甲乙丙丁待裁。
- 2026-10-14 v0.2: 人「同意」过门——甲乙丙丁照建议。
- 2026-10-14 v0.3: 实现期两项如实登记：① **起草后自审顺序修正**（已在 plan 正文 §3.1/§7 反映）：先主删后补删会在补删失败时被 404 挡死重跑路径——改**先补删后主删**，任意失败可整请求重试；单测以 calls 序列锁死该顺序契约。② **gated e2e 新坑：CommandBus 驱动需 `ref.init()`**——纯 `Test.compile()` 不触发 CqrsModule 生命周期，@CommandHandler 未注册进 bus（报 No handler found）；本测经 bus 编排必 init（与 boot 冒烟只用 compile 的分工边界清晰）。另：`PlatformTenantAction` 扩 'hard_delete'（core 包 audit 类型面）；路由 `:id/permanent` 与 `:id` 段数不同天然无冲突（无需注册序特判）；并发窗口（查态后主行被他人删）补 destroy=false → null+already_gone 审计分支并单测覆盖。
- 2026-10-14 v0.4: 验收——单测 +7·gated e2e 真库 2/2（cascade/补删/幸存/幂等/409）·CI 新基线 **294/13**·0 边界违规；文档回灌 global-tenancy 0.21.0/NFR-6 全兑现/README。
