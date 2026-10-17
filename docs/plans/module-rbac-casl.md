# RBAC 裁决引擎换轨 CASL（BA 降为纯认证）

> 适用范围: `tenancy/rbac · auth · subscriptions/workspaces 端点权限面` | 性质: 架构换轨（expand·改授权引擎）| 状态: v0.3.0·S1–S4 实现完成待 L1
> 触发: 人裁 2026-10-17「**BA 应该只管认证，授权管理由 CASL 承担**」（用户指令·权威层级最高）
> 关联: global-tenancy §9（本片修订其 §9.3 授权源条款·高危#5）· architecture 中英双份（权限判定链表述）· module-es-first-real-consumer（无关但同期）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**人裁新宪**：Better Auth 收敛为**认证与成员数据源**（身份/会话/organization_member 表），**授权裁决唯一归 CASL**（[@casl/ability v7.0.1](https://casl.js.org/v7/en/)·core 6KB·ES2020+·isomorphic）。推翻 S3 D2「BA ac 单一权限源」旧裁；「禁散点特判」条款语义不变，唯一真源从 BA ac 声明表改为 **CASL 规则表单源**。

**勘察实据（2026-10-17）**：
- 裁决链已端口化：`@RequirePermissions` → `TenantPermissionGuard`（fail-closed）→ `TENANT_PERMISSION_CHECKER` 端口 → app 侧 `BetterAuthTenantPermissionChecker`。换引擎**只动端口实现与绑定**，guard/装饰器/契约字符串面不动。
- 消费面小：HTTP 端点 5 处（workspaces×4 + subscriptions×1）。
- `TenantContext` 注释预留 `roles`「由 RBAC 切片填充」未落地；`auth-session.reader` 已消费含 role 的 memberships。
- BA 源码实证：organization 插件内置端点用其**自带默认角色表**裁决（permission.mjs `hasPermissionFn`·organization.mjs L68），移除 `accessControl()` 插件与自定义 `tenantRoles` 后内置端点行为回退默认表、不崩。
- CASL 强项对齐度：实例级 conditions/SQL 过滤本仓暂无需求（行级隔离已由仓储 tenantId 唯一卡点兜底·S2 裁）——本片仅取**端点级裁决引擎**，conditions 留钩不引入。

**目标（DoD 级）**：业务 HTTP 面授权 100% 由 CASL 裁决；BA ac 插件及其声明表、`auth.api.hasPermission` 透传全部移除；行为等价（旧 5 端点×3 角色判定不变）；默认 ci 基线只增不减。

**非目标**：不拆 organization 插件**数据面**（勘察实证：服务端自身消费 `createOrganization`（S4 系统动作）/组织切换（S9）/session.activeOrganizationId/member 表——这些属认证·数据域，保留）；不引入实例级 conditions/@casl/react/purepack；零 schema 迁移。

## 2. 方案

### 2.1 规则单源（core 侧·纯 TS 零依赖）

`libs/core/src/tenancy/rbac/tenant-rules.ts`：角色→资源→动作映射表，**语义 1:1 平移现 `tenantRoles`（S3 人裁分层）**：

| role | organization | member | invitation | workspace |
|---|---|---|---|---|
| owner | update,delete | create,update,delete | create,cancel | create,read,update,delete |
| admin | update | create,update,delete | create,cancel | create,read,update,delete |
| member | — | — | — | read |

CASL 片段由此表派生（`forAction`/规则数组），**表是 SSOT、CASL rules 是其投影**——满足新宪法「授权规则单源」。

> ⚠️ **旧裁订正（2026-10-17·[module-rbac-dynamic-roles](./module-rbac-dynamic-roles.md) 丙裁·高危#5 随片签）**：本片「`tenant-rules` TS 表是授权事实 SSOT」已被**取代**——授权事实 SSOT 迁至 DB grant 行（`tenant_role`/`tenant_role_grant`/`tenant_role_audit` 三表·per-tenant 动态角色 + 审计热改 + check 级实例 conditions）；`tenant-rules` 降为**编译期词汇表（语言 SSOT·仅 `TenantSubject/TenantAction` 类型域）**，矩阵内容整表删净；CASL rules 仍是运行时投影（checker 经仓储端口 per-tenant 懒投影 + 进程内缓存 + `invalidateTenant` 失效）。本片其余裁（BA 只管认证·授权归 CASL·@Can·ALS 预注入·禁散点特判）**不变**。

### 2.2 裁决适配（app 侧）

- `CaslTenantPermissionChecker`：端口签名换形为 `hasPermission({ role, resource, actions[] }): boolean`（旧 headers 透传形废弃）；内部按 role 从 tenant-rules 投影建 ability·`can(action, subject)` 判定。
- **角色取数（已裁丙=ALS 预注入）**：会话解析链（auth-session.reader → tenant middleware）把活动租户的 member role 填入 `TenantContext.roles`（注释预留字段兑现）；guard 从 ALS 读 role 交给端口——裁决纯内存，不再依赖 BA 运行时。
- 绑定切换：`tenancy.module` 中 `TENANT_PERMISSION_CHECKER` 换 CASL 适配器；删 `ba-tenant-permission.checker.ts`。
- fail-closed 不变：无活动租户/无 role → 403；未知角色 → deny。

### 2.3 声明面（已裁乙=换 @Can）

新增 `@Can(action, subject)` 装饰器（CASL 惯用形·subject 用 PascalCase 资源名如 `'Workspace'`）；**硬替换**旧 `@RequirePermissions`：删装饰器/`REQUIRED_PERMISSIONS_KEY`/`toPermissionMap`/`TenantPermission` 模板字符串类型（契约字典旧字面语法整体退场），5 端点调用点迁移。

### 2.3.1 端点门面替换（已裁甲=严格拆）

- **封堵**：BA org 内置 HTTP 端点（member/invitation/team 管理类）用 better-auth `disabledEndpoints` 能力封禁（执行时源码/实跑对拍确认可封清单；若能力不足则反向用 `basePath` 隔离等手段，目标一致：前端只可达我方门面）；`auth.implement` 的 `hasPermission` 透传删。
- **自建**：`tenants` 上下文新增成员管理门面（list members / update role / remove member）+ 邀请管理门面（create / list / cancel / accept invitation）：Controller 用 `@Can` 声明授权（CASL 裁决），内部调 BA **数据 API**（auth.api.*）——授权在我、数据在 BA，严格对应新宪。
- 勘实：仓内这些内置端点当前**零调用面**（前端未落地 S10），替换属「新立门面」非「迁流量」。

### 2.4 BA 降认证（拆除面）

- 删 `tenancy-access-control.ts`（tenantAccessControl/tenantRoles）与 `organization({ ac, roles })` 挂载参数；保留 organization 插件本体（会话 activeOrganizationId / membership 数据仍归认证域）。
- 删 `auth.implement.ts` 的 `hasPermission` 透传（前端未落地·S10，无消费方）。
- `permissions.ts`/port 注释改写：唯一真源=tenant-rules 表（引本片新宪）。

### 2.5 等价验收（迁移不丢语义）

- **矩阵锁测**：tenant-rules 表 × 三角色 全组合 `can/cannot` 断言（CASL ability 对表逐格核对）——旧 ac 语义 vs 新 CASL 语义**逐格等价**。
- guard 单测：5 端点所需权限串 → 判定路径回归（含 fail-closed 码）。
- gated e2e 不新增（既有 403 断言面在 tenants/workspaces e2e 回归）。

## 3. 影响面与风险

- 高危 **#5**：`global-tenancy §9.3` 授权源条款 + architecture 表述修订（CASL 新宪落文）。
- 新依赖 `@casl/ability@7.0.1`（registry npmmirror·无 CN 适配问题）；删码：BA checker 适配/ac 声明表/透传（随本片·属换轨必然）。
- 风险：BA 内置 org 端点回退默认表后，若默认表语义与现 tenantRoles 有差（如 invitation 动作名），前端直调面行为变化——**执行时以源码对拍默认表实际内容并在 plan 留痕**，有差即人复核。
- 授权判定不再回查 BA（若取丙=乙）：per-request 少一次网络/DB 往返（性能向）。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计**（2026-10-17 AskUserQuestion 甲–丁逐裁：甲=严格拆（BA 内置 org 端点封禁·自建成员/邀请门面·数据 API 仍走 BA）；乙=换 `@Can(action, subject)` 装饰器硬替换；丙=会话解析点 ALS 预注入 `TenantContext.roles`；丁=高危 #5 随片签 + 新依赖 @casl/ability@7 照案）——方向本身系人直裁「BA 只管认证·授权归 CASL」
- 未决项：无（封堵手段具体机制——disabledEndpoints 可得性——属执行期实跑对拍项，目标不变）
- 审计人 / 日期：人（FDE·AskUserQuestion）· 2026-10-17

### 4.1 执行期偏差留痕（实现事实回写·不改裁定目标）

1. **表词汇 read 扩项（现状对拍非放权）**：BA 源码坐实 `list-members`/`list-invitations` 内置端点仅检 isMember（全成员可读）——`TENANT_RULES` 的 Member/Invitation 扩 `'read'` 属**平移旧现状**（迁移不丢权限·§2.5 验收锚口径）；矩阵锁测 member 锚点同步改为「仅读三面·写面全拒」（v0.1.0 初版照抄旧 ac 声明表的偏差已订正）。
2. **封堵手段换形**：better-auth 1.7.7 dist 零命中 `disabledEndpoints`（无此能力）→ 落点改本仓 auth handler 入口谓词 `isSealedOrgHttpPath`（pathname 判 `/organization` 段→ 404）；封堵面为内置 36 端点**全量**，其中 teams/roles/check-slug/update/delete 等面本阶段**不代建**（仓内零消费·前端未落地 S10）——甲裁「前端只可达我方门面」目标达成，门面只建当下有需求面的成员/邀请两块。
3. **BA 服务端真名对拍订正**：client 面 `getOrganizationList` **不存在于 server 路由表**（server key=`listOrganizations`），且 `listOrganizations` 返回纯 org 字段不带 role——丙裁角色预注入取数改 `auth.api.getActiveMemberRole`（直返 `{ role }`·非成员 APIError 拒→ undefined fail-closed）。
4. **窄门面加法扩面**：`auth.implement` 手写的 `auth.api` 是加式透传面（非 BA 原始对象），封堵后门面/reader 的服务端直调需补齐 10 个透传方法（getActiveMemberRole/listMembers/updateMemberRole/removeMember/listInvitations/cancelInvitation/listOrganizations/leaveOrganization/rejectInvitation/listUserInvitations）——与 createOrganization 同一「服务端编排网关」既有范式，属甲裁必要后果。
5. **mapBaError 不降级前置拒绝**：门面自身抛的 `ForbiddenException`（auth 实例未就绪）不得被二次包装成裸 `HttpException`（丢类型/丢 errorCode）——已是 `HttpException` 者原样直透（单测锁）。

## 5. 完成判据（可核验 + 穷尽）

- [x] tenant-rules 表落 core·CASL 投影与表逐格等价矩阵测绿（含 §4.1-1 订正后的 member 仅读三面锁定）
- [x] `@Can` 硬替换落地：旧 `@RequirePermissions`/toPermissionMap/模板字符串类型零残留；5 端点迁移
- [x] `TenantContext.roles` ALS 预注入生效·裁决链不再携 headers 调 BA（取数真名订正见 §4.1-3）
- [x] BA 内置 org 授权端点封堵实证（谓词单测 + gated e2e 真 HTTP 直访 404（含带会话）·反锁非 org 面不误伤；门面委派/错误归一单测绿）
- [x] `CaslTenantPermissionChecker` 绑定生效·BA checker/ac 插件声明表/hasPermission 透传删净（grep 零残留）
- [ ] 默认 ci 基线只增不减（404/29 起）；`pnpm run ci` L1 绿；gated e2e 既有 403 面回归
- [ ] `global-tenancy §9.3` + architecture 中英双份授权源表述改 CASL 新宪（高危#5 已随片签）；精确提交推送

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人裁「BA 只管认证·授权由 CASL」触发换轨 | 首版：端口复用架构（手术面=换适配实现）+ 规则表单源投影 + 拆除面 + 矩阵等价验收 + BA 内置端点回退默认表实证 |
| 2026-10-17 | 0.2.0 | 审计门甲–丁逐裁（甲严格拆/乙@Can/丙 ALS 注入/丁高危#5 随签） | 新增 §2.3.1 端点门面替换（封 BA 内置 org 授权端点+自建成员/邀请门面·数据 API 仍走 BA）；@RequirePermissions 改硬替换；端口签名换形 role 入；DoD 扩充封堵实证 |
| 2026-10-17 | 0.3.0 | S4 实现期事实回写 | 新增 §4.1 偏差留痕五条（read 扩项现状对拍/封堵谓词换形不代建 teams-roles 面/getActiveMemberRole 真名订正/窄门面加法扩面/mapBaError 不降级）；DoD 前五条打钩（定向 vitest 202+绿·gated e2e 封堵/隔离/seats 真 HTTP 实证绿） |
| 2026-10-17 | 0.4.0 | 人类验收·结项 | 人「批量验收待验片」签核：实现 `2c3e185`+文档 `655fbdc` 均 in origin/main，基线 404/29→416/30 只增不减·§4.1 偏差留痕五条追认，README 索引翻「已验收·结项」；实例级 conditions 留钩已由 dynamic-roles S4 兑现。 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.4.0 变更，以当前正文内容为准。
