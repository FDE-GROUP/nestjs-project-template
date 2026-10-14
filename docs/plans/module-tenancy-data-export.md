# 技术方案 · 租户级数据导出（NFR-6 · vision 阶段 3 开段首切片）

> 状态: **已实现·待验收**（人批准 2026-10-14·甲乙丙丁照建议·高危#5 随批·实现完成 CI **287/11**）| 读者: **Agent**（开发依据）
> blast radius: **module**（`modules/tenants` 读侧扩展·**零 schema 变更不触 migrate**·不接全局 APP_GUARD）+ 触 **高危#5**（vision §7 阶段 3 开段落笔·随审计门签核）
> 关联: [global-tenancy](./global-tenancy.md) NFR-6 / S5 行「保留行供按租户导出」/ §8 FR-6 · [vision](../specs/vision.md) §7 阶段 3 · §45 数据与合规

## 1. 背景与问题

- **NFR-6**（global-tenancy）：「数据导出/删除以**租户**为单位可执行（GDPR 被遗忘权，实现留阶段 3）」——PIPL **按自然人**的查阅/导出已于 C1·FR-7 落地（`GET /users/me/data-export`·`ExportUserDataQuery`→`UserDataExportReadModel`），**按租户**维度至今空缺。
- **S5 挂账**：delete 采软删（deleted 终态）的既有理由即「保留行供按租户导出/硬删·NFR-6」——导出未落地则 deleted 终态的闭环用途只兑现了一半。
- 现有装配先例齐备：`modules/tenants` 平台治理读侧三件套（`get-tenant-diagnostics` 等 query/read-model/handler + `platform-tenants.controller` 逐路由 `PlatformOperatorGuard`），本片即该形态的自然延伸。

## 2. 目标与非目标

**目标**
1. `ExportTenantDataQuery`（application 读侧）：按租户聚合导出「租户名下数据」为**单一 JSON payload**。
2. 平台端点 `GET /platform/tenants/:id/export`（controller 逐路由 `PlatformOperatorGuard`·deny 语义同既有诊断端点）。
3. **deleted 终态租户亦可导出**（查询面不因 status 过滤·S5 硬删前取证用途）。
4. 凭据/material 排除纪律对齐用户级导出范式（不导 password/token/consent.evidence）。
5. gated e2e 或 handler 级测试坐实端到端形状（§6-丁默认单测为主）。

**非目标**
- ❌ 文件流 / ZIP / 异步导出任务（大租户场景·留后续，见 §6-乙）。
- ❌ `event` 表导出（内部审计存储·PIPL 补删已由 `deleteByAggregate` 承接，见 §6-丙）。
- ❌ 租户管理员**自助**导出端点（授权语义另议·见 §6-甲）。
- ❌ 导出后的硬删执行面（`deleted` 终态→硬删属数据删除另一半·NFR-6「删除」仍留后续）。
- ❌ 新表/新列（纯读·高危#1 不触）。

## 3. 设计（决策完备）

### 3.1 导出内容（租户名下·SSOT=`organizationId` 归属可导表）

| 数据 | 表 | 字段处理 |
|---|---|---|
| 租户档案 | `organization` | 全行（含 `metadata` 状态机 JSON·slug/name 等） |
| 成员名册 | `member` + join `user` | member 行（role/组织内 createdAt）+ 关联 user 的 `id/name/email`（**仅这 4 项·无 account/session 凭据**） |
| 邀请 | `invitation` | 全行（status/email/expiresAt·invitation 表 email 为受邀人 PII·平台侧可见与既有治理读面同界） |
| 工作区 | `workspace` | 全行（organizationId 归属） |
| 订阅 | `tenant_subscription` | 全行（档位/seatsLimit/providerCustomerId·**无支付密钥面**） |
| 业务样例 | `post` | 全行（演示「业务表按租户聚合」的扩展点范式·含 `workspaceId` 若有） |

- 实现：handler 经 `DrizzleService.db` 逐表 `where eq(x.organizationId, id)` 聚合（读侧·表所有权纪律条款②宽松·不新增写面）。
- 形状：`TenantDataExportReadModel { tenant, members, invitations, workspaces, subscriptions, posts }`——纯 POJO 接口置于 `application/read-models/tenant-data-export.read-model.ts`，注释明笔凭据排除的安全边界（对齐 user-data-export.read-model 同款 SECURITY 块）。

### 3.2 CQRS 接线

- `ExportTenantDataQuery extends BaseQuery<TenantDataExportReadModel>`（ctor `tenantId`）+ `ExportTenantDataQueryHandler`，追加进 `tenants.module.ts` 既有 `QueryHandlers` 数组（与 `GetTenantDiagnosticsQueryHandler` 同款注册形态）。
- `PlatformTenantsController` 增 `@Get(':id/export')`·`@UseGuards(PlatformOperatorGuard)` 逐路由（同 approve/reject/diagnostics 先例·不触高危#4）；org 不存在→404（对齐既有诊断端点错误语义）。

### 3.3 零迁移声明

全部读现有列，无 schema 改动 → 不触 `drizzle:generate/migrate`（高危#1 天然不触）；不动 codegen 导出面与路由前缀装配。

## 4. 测试计划

1. **handler 单测**（mock db 或内联夹具·对齐 get-tenant-diagnostics.handler.test 范式）：① 六段聚合形状完整；② 输出 JSON 序列化后**不含** password/accessToken/refreshToken/evidence 任一键（红线断言）；③ deleted 态租户可导出（status 过滤缺失断言）；④ 无此租户 → 404/not-found 语义。
2. **controller 元数据测**（既有范式）：`:id/export` 挂 `PlatformOperatorGuard`。
3. **gated e2e**（可选·若成本低）：真库插 1 org+成员+post → 服务端透传 query handler 断言行数与形状（默认 CI skip·不破 DB-free 不变量）。

## 5. 验收标准（DoD）

- [x] 六表聚合 + 凭据排除红线单测绿（adapter 层 +4 测·含形状/红线序列化/deleted 可导/null）；
- [x] 无新全局中间件/守卫（controller 类级 `PlatformOperatorGuard` 已罩全部路由·实现期订正见 §8 v0.3）；
- [x] `bun run ci` 全绿（基线 283/11 起·新增数为正）·fallow 边界 0 违规；
- [x] vision §7 阶段 3 开段落笔 + global-tenancy NFR-6/S5 挂账回灌 + plans/README 结账。

## 6. 未决事项（待人裁·附建议）

- **甲 · 消费者面**：首片仅**平台运营侧**（`PlatformOperatorGuard`·复用既有治理形态），租户管理员自助导出留后续？——**建议：是**。理由：租户自助导出涉及「管理员见其他成员 PII」的授权语义宣示与产品策略，独立成片更稳；平台侧先行满足 S5 取证/运营备份刚需。
- **乙 · 格式契约**：**同步 JSON payload**（用户级范式同款），ZIP/流式/异步任务留大租户触发？——**建议：是**。模板最小数据量下同步 JSON 即闭环；文件流牵动 storage provider 写面与异步任务表（触 migrate），渐进不预支。
- **丙 · `event` 表是否入导出**：**建议不导**。事件存储是内部审计面（PII 补删已由删除级联承接），业务状态导出以六表为完备；若合规质询需事件历史，走专用取证流程而非通用导出面。
- **丁 · vision 落笔形态**：§7 阶段 3 行内加注「已开段（2026-10-14 人裁·首切片=租户导出）」+ 演变记录 0.1.3——**建议如此**，不做结构性改写。

## 7. 风险与回退

- 成员名册含 user email 属其他自然人 PII：平台侧可见性与既有 `list-platform-users`/诊断面**同界**，不扩大暴露新类型；响应面不经租户上下文透给非 operator（guard fail-closed）。
- 回退：纯读侧新增端点，revert 即净退，无迁移/无状态副作用。

## 8. 演变记录

- 2026-10-14 v0.1: 依人裁「a」（宣示阶段 3 + 立项）起草。取证坐实：PIPL 用户级导出已在（ExportUserDataQuery 三层范式）、租户级空缺；平台治理读侧三件套+逐路由 guard 先例（platform-tenants.controller）；organizationId 归属可导表六张（organization/member/invitation/workspace/tenant_subscription/post）；零 schema 变更。§6 甲乙丙丁待裁。
- 2026-10-14 v0.2: 人「同意」过门——甲乙丙丁照建议·高危#5 随批。
- 2026-10-14 v0.3: 实现期三项如实订正：① **接线层位**——§3.1 首轮写「handler 经 DrizzleService.db 聚合」与本模块既有「handler→domain port→infrastructure adapter」三段式不符（既有全部 governance handler 均走 port·P1 倒置里程碑同线），改：`TenantGovernanceRepository` 加 `exportTenantData`，Drizzle adapter 实现，handler 纯转发；形状由 domain 持有，read-model 文件作消费门面 re-export（有真实消费者·非挂账冗余）。② **guard 接线**——§3.2 写「逐路由 `@UseGuards`」，实态 controller 已类级 `PlatformOperatorGuard` 罩全路由，新端点自动覆盖，无需重复接线（安全语义不变·仅措辞订正）。③ **gated e2e 未做**——§4-3 弹性条款（「若成本低」）：operator 判据依赖 `platform.operatorEmail` 配置+seed 实用户，真库 e2e 成本高于预期；掩盖面由 adapter 单测（含红线序列化断言）+ 既有 boot 冒烟（整树 DI 含新 handler）+ 类级 guard 既有矩阵测覆盖。另：invitation 段走 `select()` 全列（表无敏感列），其余五段显式投影。
- 2026-10-14 v0.4: 验收——单测 +4（11/11 绿）·tsc 净·CI 全绿新基线；文档四处同步（vision 0.1.3/global-tenancy 0.20.0/README）。
