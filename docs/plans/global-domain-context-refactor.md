# 领域细化重构：抽出 authorization 上下文 + 认证/用户/多租边界定型（global-domain-context-refactor）

> 适用范围: `全局`（core 契约路径 + apps/api 模块装配 + 上下文地图/表所有权·高危 #2/#3）
> 关联: module-rbac-dynamic-roles（其散落件为本片归位对象）· module-rbac-casl · global-tenancy §9.3 · `specs/architecture.md` 限界上下文地图
> 性质: 新立项（人裁需求「领域划分更细化——认证、授权、多租户、租户、用户、角色、权限等更容易维护」·经多轮审问式审计后 plan 批准 2026-10-17）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

现状「授权」散在 5 处（tenants 域件 / tenancy 边界层 / core rbac）、`tenancy/` 大杂烩、认证与用户边界含糊——难维护的病根。裁定的目标上下文地图：

业务上下文（各自独立语言 + 生命周期）：
- `authentication`（现 `modules/auth`）：凭证/会话/因子/OAuth 渠道·断言「你是谁」
- `users`：身份主体/资料/PIPL 自助·慢变合规敏感
- `authorization`（**新建**）：**全局统一裁决域**（非 tenants 子域、非 platform 附庸）——角色/权限/授予/裁决/审计·含两作用域层：租户 scope（TenantRole·orgId 内）+ 平台 scope（跨租户·现状=FR-13 operatorEmail config 硬判·**概念归属登记、实现不动**）
- `tenants`：org 生命周期/成员/邀请/状态机（减去搬走的 RBAC）
- `workspaces`：租户内资源分区·本片**不动**·仅显式定位
- `platform`（**新建**）：平台经营者跨租户治理——operator 闸门/平台审计/平台身份·配置端口 + `platform-tenants`/`platform-users` HTTP 门面；**无自有表**·**不自持角色模型**
- `posts`/`subscriptions`/`payment`/`storage` 保持不动

横切机制层（非业务上下文）：
- `tenancy/`：多租户隔离机制（ALS 租户上下文 + TenantScopeGuard + middleware + exempt/public）+ 状态/会话/配额适配·**消费** authorization 裁决端口

术语纪律：「租户 Tenant」=业务概念（tenants 核心域聚合）；「多租户 Multi-tenancy」=隔离机制（基础设施·无聚合无生命周期）。lifecycle（deny-list）与 quota（席位）是**借用机制的域策略**——归位见 §4 未决项 4。

三条划界纪律（全程遵守·防误并/误拆）：
1. **成员归属边界只认 Organization**：`user` 平台级跨租唯一；`member`（user×org）是联结实体·角色挂 Member 不挂 User。
2. **Workspace 非第二道隔离墙**：隔离只认 `organizationId`；workspace 仅租户内结构层次·是授权词汇表的一个 subject·不是角色作用域。
3. **跨上下文引用一律弱耦合**：role-key/organizationId/workspaceId 皆普通 string 列·不建跨上下文实体关系；接缝端口只传标识/快照·不外泄实体。

**非目标**：不改任何对外行为/路由/schema；不做平台角色表化（高危 #1·另片签核）；不接 query 级列表过滤。

## 2. 方案（切片 A → B → D → C · 每片独立可验 · 高危 #2/#3 各片开工前须人明示签核）

1. **A：抽出 `authorization` 限界上下文**（顺带消端口倒挂）——
   - A1 `apps/api/src/modules/authorization/{domain,application,infrastructure,api}` 迁入 tenants 散落 RBAC 件（仓储端口/策略/seed/Mikro 适配/应用服务/管理门面〔controller 更名 `AuthorizationAdminController`·路由 `/tenants/roles` 不变〕）+ tenancy 的 CASL checker/ability.factory + guard 测；`rbac-tables.ts` 留原地（infra 表元数据·守卫不触）。
   - A2 core 契约 `libs/core/src/tenancy/rbac/*` → `libs/core/src/authorization/*`（全仓 import sweep·端口符号名维持防二次 churn）。
   - A3 新建 `AuthorizationModule`（@Global·`TENANT_RBAC_REPOSITORY` useClass·checker `useExisting` 绑读/写端口·provide+export `TenantPermissionGuard`）；`TenantsModule` 删 RBAC provider/controller/export；`TenancyModule` 删 checker/guard/端口绑定与 `imports:[TenantsModule]`；`AppModule` 注册。
   - A4 表所有权：`tenantRole/tenantRoleGrant/tenantRoleAudit` → `'authorization'`（守卫 `contextOf` 自动推导·无逻辑改动）。
   - A5 接缝：authorization 导出 published port `ROLE_ASSIGNABILITY_READER`（`isRoleAssignable`）供 tenants org-admin 消费·依赖方向 tenants(核心域)→authorization(支撑域)。
   - 判据：build 0 / check 净 / ci 全绿基线 **480/30 只增不减** · 表所有权守卫绿 · di-context 集成测证 guard+checker 新装配可真实解析 · @Can 元数据锁测迁位后绿。
2. **B：划清 authentication ↔ users 边界**——固化边界条款入宪（architecture ±zh）；复核归位疑似渗透件（`seats-quota.hook.ts`/`session-resolver.ts`）；目录是否物理更名 `modules/authentication` 见未决项 2。判据：全绿 480/30·无行为变更·错件归位有测锁。
3. **D：抽出 `platform` 平台治理上下文**——core 契约 `tenancy/platform/*` → `core/platform/*`；适配 `mikro-platform-identity.lookup`/`config-platform.settings` + HTTP 门面 `platform-{tenants,users}.controller` 迁入 `modules/platform/`；治理命令/查询 handlers **留 tenants**（未决项 3 建议档）；`PlatformOperatorGuard` 判定不动（FR-13）；新建 `PlatformModule` @Global·无表主变更。判据：全绿 480/30·门面行为/路由不变·di-context 证新装配可解析。
4. **C：`tenancy/` 定型横切层并入宪**（最后·把 A/B/D 定态写进宪法）——architecture ±zh + global-tenancy §9.3 表述订正 + table-ownership 注释复核。纯文档。判据：全绿·宪法地图与实现实测对拍一致。**开工前须人确认（高危 #3）**。

## 3. 影响面与风险

- **blast radius**：A 片 ≈17 文件搬迁 + 24 文件 core import + 3 模块装配 + 1 所有权翻账 + 1 新端口；D 片同类。**可逆**：纯搬迁·revert 即回滚。
- 高危 **#2**（core 契约路径/端口符号 + DI 装配形态）：A 开工已随 plan 批准得人签核；D 片同面须再签。
- 高危 **#3**（architecture 地图 + table-ownership 清单）：入宪动作压在 C 片·开工前再确认。
- 高危 **#1**：零 schema 变更（平台角色表化明确排除在本 plan 外）。
- 遗留风险：D 片 `TenancyModule` 摘除平台 providers 后其 exports 消费面需全仓 sweep 兜底；@Global 面扩大（Authorization/Platform 两模块）须防装配冒烟破。

## 4. 未决项（人拍板·登记归人）

1. **A5 端口形状**：采独立 `ROLE_ASSIGNABILITY_READER`（已实现·弱耦合最优）vs 直接导出 `TENANT_RBAC_REPOSITORY` 供 tenants 注入——**已裁**：取前者（A 片落地）。
2. **B**：`modules/auth` 是否物理更名 `modules/authentication`（churn vs 自解释）——**已裁（人授自裁 2026-10-17）**：不更名·宪法定名 authentication·物理更名缓行。
3. **D 接缝**：治理命令/查询 handlers 是否随门面搬入 platform（建议：**留 tenants**·platform 只持闸门+审计+门面）——**已裁（D 片落地）**：取建议档·handlers/读模型留 tenants·controller 经 CQRS Bus 委派。
4. **quota/lifecycle 归位**：域策略终态应还业务域（lifecycle→tenants、quota→subscriptions/平台治理）——本 plan 不动仅地图定位·归位时机另裁。
5. **平台层授权形态**：(a) 概念归 authorization、实现维持 guard 现状（**本 plan 默认**）；(b) D 内收敛为消费 authorization 平台 scope 接口；(c) 平台角色表化（#1·schema 另片）。
6. **机制层命名**：`tenancy/` 是否改名 `multi-tenancy/` 以区别租户业务域——**已裁（人同意 2026-10-17）**：不改名。理：① tenancy 本就是业界机制名（如 nestjs-tenancy·tenant=业务概念/tenancy=隔离机制的词义区分既存）；② 歧义源是 tenancy↔tenants 近形词·已由宪法术语纪律条款消歧·改名后内部 `TenantContext`/`TenantScopeGuard` 等 tenant* 词汇与目录名反而打架；③ 改名触高危 #3（全仓 `@core/saas-kit/tenancy/*` import + 宪法 ±zh 条目再修）。强化自解释的优先级：先推未决项 4（lifecycle/quota 归位·机制层提纯），物理改名（含未决项 2 的 auth→authentication）另片合并归人签核。

## 5. 执行记录

- **A 片已落地（2026-10-17·commit `198a5bd`·待推送）**：
  - A2：core `tenancy/rbac/` 四件迁 `libs/core/src/authorization/`；全仓 `@core/saas-kit/tenancy/rbac/*` → `@core/saas-kit/authorization/*` sweep（含 `tenant-context.service`/`request-session.port` 相对导入深度修正）；端口符号名未动。
  - A1：`apps/api/src/modules/authorization/` 建成——domain（`tenant-rbac.repository` 端口/`tenant-rbac-policy`/`system-role-seed`/新增 `role-assignability.port`）、application（`tenant-rbac-admin.service`·`implements RoleAssignabilityReader`）、infrastructure（`mikro-tenant-rbac.repository`/`casl-ability.factory`/`casl-tenant-permission.checker`）、api（`authorization-admin.controller` + `dto/authorization.dto`·路由 `tenants/roles` 不变·`tenant-permission.guard.test` 随迁入内）。
  - A5：org-admin 控制器改注入 `@Inject(ROLE_ASSIGNABILITY_READER)`（不再直 import 授权侧应用服务类）；facade/dto 测试同步改形。
  - A3：`AuthorizationModule`（@Global·零 import 无环）建成并注册于 `AppModule`（TenancyModule 前）；`TenantsModule` 摘除 RBAC 四 import/controller/provider 绑定与 `exports`；`TenancyModule` 摘除 `imports:[TenantsModule]`、checker/guard providers、两条 `useExisting`、三项 exports·docstring 记迁移去向。
  - A4：`table-ownership.ts` 三表 `'tenants'`→`'authorization'`。
  - **验收存照**：`pnpm run ci` PASSED·build TSC 0·Biome 净（check:fix 归一 9 文件 import 序）·**480 passed / 30 skipped 基线不动（只增不减）**·authorization 新家 10 测文件 75 例全绿（含 di-context 6 例·表所有权守卫 3 例·@Can 元数据锁·checker S2+S4 全测·guard 测迁位）。
  - 偏差留痕：`casl-ability.factory` 与其测随 checker 迁 `authorization/infrastructure/`（plan 只点名 checker·factory 是 checker 私有件同迁）；`system-role-seed.test.ts` 对 factory 的 import 已同步改指。

- **B 片已落地（2026-10-17）**：
  - 入宪：`architecture.md` + `architecture-zh.md` 各新增「Context Boundary: Authentication ↔ Users」一节（authentication=身份断言与会话生命周期·目录仍名 `modules/auth`；users=身份主体与 PIPL 自助；表属主 `user`→users·`account/session/verification`→authentication；接缝=用户↔成员·角色挂 Member 不挂全局 User；挂载钩子不得误读为属主）。
  - 错件复核（实读裁定·**无错件可归位**）：`session-resolver.ts` 居 authentication 合规（纯会话解析面·供 SessionGuard 与 tenancy `auth-session.reader` 消费·不判 allow/deny）；`seats-quota.hook.ts` **搬离否决**——它是 Better Auth 挂载点传送带胶水（物理位置受 plugin 装配事实约束）·裁决本体已在 `core/tenancy/quota` QuotaService·入宪条款固化为防误读纪律。
  - 未决项 2 已裁（人授 Agent 自裁）：保留 `modules/auth` 目录名·宪法定名 authentication·物理更名缓行另片。
  - **验收存照**：check 净·build TSC 0×2·`pnpm run test` **480/30 基线不动**（纯文档·无行为变更）。

- **D 片已落地（2026-10-17）**：
  - core 契约 `libs/core/src/tenancy/platform/*` 四件迁 `libs/core/src/platform/`（旧目录物理清零）；内部相对导入深度修正（`../lifecycle→../tenancy/lifecycle`、`../../shared-kernel→../shared-kernel` 等）；全仓 `@core/saas-kit/tenancy/platform/ → @core/saas-kit/platform/` sweep（含 tenants 治理 handlers/测试·Symbol token 名未动）。
  - `apps/api/src/modules/platform/{api,infrastructure}` 建成：HTTP 门面 `platform-{tenants,users}.controller` + 三专属 dto（`list-platform-tenants/list-platform-users/suspend-user`）迁入 `api/`（路由不变）；适配 `mikro-platform-identity.lookup`/`config-platform.settings` 迁入 `infrastructure/`；`tenancy/platform/{platform-operator.guard,platform-audit.service}.test.ts` 随迁（旧目录清零）；controller 对 tenants 命令/查询/读模型的导入改 `@app/modules/tenants/…` 绝对路径（handlers **留 tenants**·未决项 3 取建议档·经 CQRS Bus 委派）。
  - 装配：新建 `PlatformModule`（@Global·imports CqrsModule·provide guard/audit + 两端口 useClass·export 四项）；`TenantsModule` 摘两 controller；`TenancyModule` 摘 platform 四 import/两 provide/两 useClass/四 export（横切层至此只剩隔离机制+状态/会话/配额适配）；`AppModule` 注册 PlatformModule。表所有权零翻账（platform 无自有表·读面宽松不触守卫）。
  - 验收新增锁测：`di-context.integration.test.ts` ⑤ 块——AppModule 整树（含 PlatformModule 真实装配）解析 guard/audit/`PLATFORM_IDENTITY_LOOKUP`(Mikro 适配)/`PLATFORM_SETTINGS`(Config 适配) 四项·DB-free。
  - `PlatformOperatorGuard` 判定语义未动（FR-13 email 命中 config 硬判）；平台 scope RBAC 化不在本片。
  - **验收存照**：`pnpm run ci` PASSED·build TSC 0×2·Biome 净·**481 passed / 30 skipped（基线 480→481 只增不减·+⑤ 锁测）**·旧路径零残留（仅 docstring 历史溯源注）。

- **C 片已落地（2026-10-17·commit `35efec0`·待推送）**：
  - 宪法 ±zh 目录树重写为实存九上下文 + `tenancy/` 横切机制层条目（删陈旧 `stripe/` 行·补 posts/subscriptions 实存行）；各新增「Bounded Context Map & the Multi-Tenancy Mechanism Layer / 限界上下文地图与多租户机制层」节：术语纪律（租户=业务概念·多租户=隔离机制·不可混住）、authorization=独立支撑域服务两类消费者、platform=无聚合治理门面、workspace=subject 非角色作用域、弱耦合纪律（string 列+published ports）、三层权限链。
  - `global-tenancy.md` §9.3 补「领域细化定态」条（tenancy 消费 authorization 裁决端口·经 A 不住 checker、经 D 不住平台治理）+ 演变表 0.23.0 行 + 头部版本推进。
  - `table-ownership.ts` 头注释复核仍自洽（`tenancy/**` 归 tenants），补定态语境注（三表已翻 authorization·platform 无自有表不在清单出现）。
  - 对拍实测：`apps/api/src/modules/` 实存目录与宪法树逐一对应（auth/authorization/tenants/platform/workspaces/posts/subscriptions/payment/storage + `tenancy/`）。
  - **验收存照**：`pnpm run ci` PASSED·纯文档+注释·**481/30 基线不动**·高危 #3 入宪完成。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | v0.1 | 立项（plan 经人多轮审计后批准） | A 片落地全绿并 commit `198a5bd`（待推送）；B/D/C 未开工·各片开工前高危逐签 |
| 2026-10-17 | v0.2 | 人授「三项归 Agent 自行裁定」 | 裁 1 本地提交 A 片（推送归人）；裁 2 B 片签核开工；裁 3 未决项 2＝保留 `modules/auth` 目录名·仅宪法定名 authentication·物理更名另片缓行 |
| 2026-10-17 | v0.3 | B 片落地 | 边界条款入宪 ±zh·错件复核裁定皆合规原位（seats-quota.hook 搬离否决·挂载≠属主）·基线 480/30 不动 |
| 2026-10-17 | v0.4 | D 片落地 | platform 上下文抽出（core 契约迁址+适配/门面/测试归位+PlatformModule 装配+未决项 3 裁留 handlers）·di-context ⑤ 新锁测·基线 480→481 只增不减 |
| 2026-10-17 | v0.5 | C 片落地·整 plan 四片入库 | tenancy 定型横切机制层入宪（±zh 树重写+上下文地图节·§9.3 定态+演变 0.23.0·table-ownership 语境注·树↔目录对拍）·ci 全绿 481/30 不动·高危 #3 完成·推送归人·未决项 4/5 仍挂账另片 |
| 2026-10-17 | v0.6 | 收口后命名质疑裁定（未决项 6 落定） | 人问「tenancy 改名 multi-tenancy 是否更合理」→ Agent 建议不改·人「同意」：tenancy 即业界机制名·歧义由宪法术语纪律消解·改名触高危 #3 churn；落点加宪法指针 docstring·优先序＝未决项 4 机制层提纯另片 |
