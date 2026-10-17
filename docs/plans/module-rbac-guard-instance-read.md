# RBAC guard 对「纯实例受限角色」的 HTTP 入口拦截：read 动作类型级放行与否的语义改判呈审

> 适用范围: `模块(authorization·CASL checker 判定语义 + tenant-permission guard 热路径)` ← = blast radius：**已验收公共契约的判定语义改判面**（checker `can` 守卫路径的类型级投影规则）——非加法式变更，须人单点签核
> 关联: [module-workspace-owner-column](./module-workspace-owner-column.md) §6 v0.3.0②（本片实跑捕获的缓账源头）· [module-rbac-query-level-filtering](./module-rbac-query-level-filtering.md)（`listPredicate` 三态已验收机制·本片不动）· [module-rbac-dynamic-roles](./module-rbac-dynamic-roles.md)（实例级授权三需求）· [module-rbac-casl](./module-rbac-casl.md)（over-grant 防线原始裁定）
> 性质: 缓账呈审（归人裁点结构化·非执行文档）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与问题陈述

owner-column 片五向 gated e2e 实跑坐实现状：**只带 conditions 行（如 `{ownerId:'{{userId}}'}` read grant）的角色，在 HTTP 入口即被路由 guard 403**，实例级授权在 read 面端到端不可达（列表演示被迫走 handler→repo 全链预案档）。机制链（均为既有已验收代码·非缺陷）：

- `TenantPermissionGuard`（`libs/core/src/authorization/tenant-permission.guard.ts`）调 `checker.can({organizationId, role, action, subject})`——**不带 resource**（守卫时点无实例）；
- `casl-tenant-permission.checker.ts` 对无 resource 路径走 `entry.typeLevel.can(...)`（S2 守卫热路径），而 `buildEntry` 的类型级投影按 **over-grant 防线**只纳入 `conditions=null` 行（CASL v7 类型级 `can(action, subject)` 不下推 conditions，纳入会静默升为全量放行）；
- 故 conditions-only 角色 → 类型级无匹配行 → 403。

**为什么当时保守是对的**：写面（update/delete check 级）无行过滤兜底，若 conditions 行入类型级投影，`update` 也会被放行到 handler 后仅靠 resource 级 check——漏检即全量可写。防线方向正确，但代价是 **read 面同样被连坐**（list 已有 `listPredicate` 行过滤下推，放行到 handler 无越权增量）。

## 2. 裁定议题（归人·本 plan 不自裁）

**议题 A：是否将「read（及 list）动作」纳入实例受限角色的 HTTP 入口可用面？**（= 已验收 checker 判定语义改判）

| 选项 | 机制 | 授权面变化 | 风险 |
|------|------|-----------|------|
| **A1 按动作分治（呈审推荐档）** | guard 路径判定改为 action 感知：写动作（create/update/delete/…）维持 typeLevel 仅 conditions=null 行（over-grant 防线原样）；**仅 `read` 放行条件放宽为「存在任一匹配 grant 行（含 conditions 行）」**——行过滤仍由已验收 `listPredicate` 三态与 check 级 resource 判定兜底 | read 面纯实例角色可用；列表面零越权增量（谓词下推不变） | 单 action 语义分叉，checker 注释/锁测/文档需同步改判留痕；`read` 详情面（按 id 取单资源）若某 repo 未接 `authorizationWhere`，需逐端点核验（可先只放 list 语义） |
| **A2 维持现状** | 零代码变更 | 无 | 「实例受限角色可用 read」需求继续挂账；e2e 只能以 handler 全链演示（HTTP 面永缺铁证） |
| **A3 guard 携带 resource 感知（重构档）** | 路由守卫升级为实例感知二段式（守卫时取参→check 级判定） | 表达力最大 | 改动面/性能/复杂度远超收益，多数端点守卫时点无实例可取——**不推荐**，列出仅为穷尽 |

**议题 B（若 A1 放行）**：`read` 放宽是否含「按 id 取单资源」端点，还是仅 list 语义（谓词下推覆盖处）？建议首批仅 **list 可达面**（Workspace/Post 等已接 `listPredicate` 的读链），单资源详情面逐端点核验后另批。

## 3. 影响面与风险（若采 A1）

- **高危触达**：改 `casl-tenant-permission.checker.ts` 守卫路径判定语义 + `tenant-permission.guard.ts` 传参形状（action 感知）——**公共契约已验收语义改判，须人签核后方可过审计门**（AGENTS §2；概括授权不适用本片）。
- 锁测改判面：checker 既有 over-grant 锁测须新增「read 含 conditions 行放行 / 写动作仍 deny」双向例；guard 测同步；owner-column e2e 的 `guardedB 403 现状断言`届时翻正（该断言即为本议题的在账锚点）。
- 非目标：写面行过滤、owner 写限制、guard 重构（A3）。

## 4. 取证计划（若放行实施）

checker/guard 单测双向锁形 + 既有 518 基线只增不减 + owner-column e2e 第四/五向从 handler 全链预案档翻正为真 HTTP GET 断言（`E2E_DATABASE_URL` gated 链复跑）。

## 5. 完成判据（可核验 + 穷尽）

- [ ] 议题 A/B 获人裁定（含否决 A1 即转 A2 销账的出口）
- [ ] （仅当放行）checker/guard 改判锁测绿 + owner-column e2e 断言翻正真 HTTP 面全绿
- [ ] `pnpm run ci` 全绿 + 动态角色/查询过滤/属主列三 plan 对账指针 + README 翻账

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | owner-column 片 §6 v0.3.0② 缓账立片呈审（人令「你裁定，继续推进」→ 执行方**只起草不裁**：触已验收 checker 语义改判属高危归人，审计不放行） | 首版：机制链事实陈述 + 议题 A（A1 按动作分治推荐/A2 维持/A3 重构不推荐）+ 议题 B（首批面）+ 影响面与取证计划 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 起草（**待审计——议题 A/B 须人单点裁定，本 plan 不接受概括授权放行**）；以裁定后内容为准。
