# 技术方案 · tenancy 机制层提纯：lifecycle/quota 域策略归位业务域（未决项 4 落地）

> 适用范围: `模块(tenancy→tenants/subscriptions 搬迁·触 core 契约路径 + DI 装配 + 宪法地图措辞)` ← blast radius 决定审计深度与授权粒度（`workflow.md` §3/§5）
> 关联: `plans/global-domain-context-refactor.md` §4 未决项 4（归位时机另裁·v0.6 定优先序「先推本片」）· `specs/architecture.md` ±zh「限界上下文地图与多租户机制层」节 · `specs/tooling-standards.md` §4.7 · `database/table-ownership.ts` · `apps/api/src/tenancy/tenancy.module.ts`
> 性质: 新立·中片（纯搬迁·expand 直切——本搬迁无并存窗口需求，revert 即回滚）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**现状取证（本轮直查坐实·2026-10-17）**
- 宪法地图定态：`tenancy/`=横切**机制层**（ALS 上下文 + TenantScopeGuard + middleware + exempt/public + session 端口），术语纪律明言「lifecycle（deny-list）与 quota（席位）是**借用机制的域策略**」（global-domain-context-refactor §1）。
- 实物盘点：core `tenancy/lifecycle/*`（`tenant-status.service`/`user-status.service`/两 store 端口/`tenant-lifecycle`/三事件）与 core `tenancy/quota/*`（`quota.service`/`quota.guard`/`quota.decorator`/`quota.store`/`tenant-plans`）仍驻机制目录；参考应用侧三适配 `mikro-{tenant,user}-status.store`、`mikro-quota.store` 驻 `tenancy/infrastructure/`。
- 消费面：`@core/saas-kit/tenancy/{lifecycle,quota}/*` 全仓 import 触点约 57 文件（tenants 治理 handlers、auth 会话墙 `isBlocked`、platform 门面、subscriptions 全域、event-type-registry/outbox 事件引用）。
- 装配事实（执行期直查订正）：起草时误读 grep 命中（命中的是 docstring 提及非装饰器）——`TenantsModule`/`SubscriptionsModule` **实非 @Global**（此前全局可见性一直由 TenancyModule @Global 供给）。保形改道：两归宿模块沿 Authorization/Platform 先例新贴 `@Global`+exports（DI 可见性语义等价·仍触高危 #2 已签范围内）；`QuotaGuard` 无 APP_GUARD 全局挂载（仅 provide/export），席位强执走 `seats-quota.hook` 消费 `QuotaService`。
- table-ownership 守卫现以 `tenancy/**` 推导属主 `tenants`（`table-ownership.ts:10`）——适配迁位后推导口径需对拍（切片 A 实证，不臆断）。

**目标**
1. lifecycle 归位 **tenants**（租户/用户状态机是租户治理域策略）：core 契约 + api 适配 + 服务装配整体迁 tenants 上下文。
2. quota 归位 **subscriptions**（席位配额是订阅域策略·FR-7）：core 契约 + api 适配 + 服务装配整体迁 subscriptions 上下文。
3. `tenancy/` 提纯为**纯机制层**：仅余 tenant-context（service/ALS）、TenantScopeGuard（含 APP_GUARD 注册）、TenantMiddleware、exempt/public 装饰器、session 端口与其适配。
4. 宪法地图同步：±zh「tenancy 机制层」条目摘除「状态/配额适配」措辞，落账未决项 4。

**非目标**
- ❌ 不改任何对外行为/路由/schema/DI token 符号名（防二次 churn·沿 A2/D 片惯例）。
- ❌ 不做 `tenancy/`→`multi-tenancy/` 物理改名（未决项 6 已裁另片合并·未决项 2 auth 改名同片）。
- ❌ 不动平台层授权形态（未决项 5 默认档 (a) 维持）、不做平台角色表化（高危 #1）。

## 2. 方案（切片 A → B → C → D · 每片独立可验 · 高危 #2/#3 各片开工前须人明示签核）

- **切片 A · 归位前取证（spike·零仓库变更）**——完成判据：
  1. `QuotaGuard`/`@Quota` 真实使用面全仓复核（若有 `@UseGuards` 触点逐一登记）；
  2. `event-type-registry.ts`/`outbox-relay` 对 lifecycle 三事件的**路径引用面**清点（迁址后 import 同步项）；
  3. table-ownership 守卫对「适配迁位后」状态的预演：`mikro-quota.store`（读 invitation/member 等 tenants 属主表？）迁入 subscriptions 是否触发属主红牌——若触发，裁定登记口径修法（属主表映射是**表→上下文**声明，预期不受文件位置影响·以实测为准）；
  4. 据上定 §4 未决项甲/乙/丙。
- **切片 B · core 契约迁址（触高危 #2）**——完成判据：
  1. `libs/core/src/tenancy/lifecycle/*` → **甲·建议档**：`libs/core/src/modules/tenants/lifecycle/*`（新建 core 内 tenants 域目录·与 `modules/{subscriptions,workspaces}` 同名单源惯例；**备选**：顶层 `core/tenants/`·沿 A2 `authorization`/D 片 `platform` 顶层先例——A 片取证时按 core 内「领域契约放 modules/、上下文门面放顶层」的既有分布裁定）；
  2. `libs/core/src/tenancy/quota/*` → 乙·建议档 `libs/core/src/modules/subscriptions/quota/*`（core subscriptions 域目录既存且本就是 quota 契约消费方·就地同居）；
  3. 全仓 import sweep（`@core/saas-kit/tenancy/{lifecycle,quota}/*` → 新家·**符号名一律不动**）；`tenancy/session`、context、guard、middleware、装饰器**留守**；
  4. 判据：build 0 · check 净 · 全仓旧路径零引用。
- **切片 C · 参考应用装配与文件归位（触高危 #2）**——完成判据：
  1. `apps/api/src/tenancy/infrastructure/mikro-{tenant,user}-status.store.ts` → `modules/tenants/infrastructure/`；`mikro-quota.store.ts` → `modules/subscriptions/infrastructure/`；
  2. `apps/api/src/tenancy/lifecycle/*.test.ts` 随服务迁 `modules/tenants/`（就近）、`quota/*.test.ts` 迁 `modules/subscriptions/`；e2e 丙·建议档：`seat-quota-member.e2e` → subscriptions（FR-7 主链）、`tenant-hard-delete.e2e` → tenants（治理链）；
  3. `TenancyModule` 摘除 lifecycle/quota 的 providers·exports·store 绑定（docstring 同步「机制层提纯后」清单）；`TenantsModule`/`SubscriptionsModule`（均 @Global 既存）接管 provide+export·绑定注释沿 §9.5.4①B 端口倒置措辞；
  4. `tenancy/di-context.integration.test.ts` 瘦身（仅锁纯机制解析），tenants/subscriptions 新家各补装配解析锁测（**基线只增不减**）；
  5. 判据：ci 全绿 **481/30 只增不减** · 表所有权守卫 3 例绿 · 行为零变更（路由/schema/响应面不动）。
- **切片 D · 宪法与文档同步（触高危 #3·开工前再确认）**——完成判据：
  1. `architecture.md` + `architecture-zh.md`「限界上下文地图与多租户机制层」节：tenancy 条目摘「状态/会话/配额适配」中的**状态/配额**措辞（session 适配留机制层·其是会话解析机制非域策略，A 片复核后落笔），并记 lifecycle→tenants、quota→subscriptions 归位定态；
  2. 主 plan `global-domain-context-refactor` §4 未决项 4 翻「已裁·已落地（本片）」+ 演变行；`tenancy.module.ts` 命名纪律 docstring 指针补一句归位已落；
  3. `table-ownership.ts:10` 语境注（`tenancy/**` 推导源措辞）按切片 A 结论同步；
  4. 判据：宪法地图与目录实测对拍一致。

## 3. 影响面与风险

- **blast radius**：core 契约 10 文件迁址 + api 侧约 60 文件 import sweep + 3 适配/6 测试/e2e 搬迁 + 2 模块装配增删 + 1 模块装配摘除 + 宪法 ±zh 两节措辞。**可逆**：纯搬迁·单 commit revert 即回滚；无 schema、无生产行为面。
- 高危 **#2**（core 契约路径 + DI 装配形态）：沿 A/D 片同面，开工前须人明示签核。
- 高危 **#3**（宪法地图 + table-ownership 注释）：压在 D 片·开工前再确认。
- **风险登记**：
  - `@Global` 解析链迁移期错位（服务在 A 模块装配摘除、B 模块未接管）→ 由整树 di-context 冒烟锁死，摘/接必须同 commit；
  - table-ownership 若按文件路径推导消费属主，quota 适配迁位可能红牌 → 切片 A 预演，必要时仅调注释/映射声明（不动属主终案）；
  - event-type-registry 对事件类的**字符串名**注册不受路径影响，但 import 路径随迁——sweep 后用 gated e2e（outbox-relay/tenant-status-subscription-link）实证事件链绿；
  - 铁律：sweep 禁用会塌 `@` 别名与 CJK 的 codemod 路线（沿已记忆双雷），逐文件 SearchReplace 或经验证的 perl 姿势。

## 4. 审计记录（已裁·人「按建议自裁」）

> 无已审方案不写码。本 plan 触高危 #2 + #3。

- 结论：**已审计**（人「按建议自裁」2026-10-17＝审计门放行 + 高危 #2/#3 开工签核随此授权 + 甲乙丙按建议档落定·沿主 plan「三项归 Agent 自行裁定」先例）。
- 未决项（已裁）：
  - **甲 · core lifecycle 归宿形态**＝**采建议档**：`libs/core/src/modules/tenants/lifecycle/*`（新建 core 内 tenants 域目录·与 `modules/{subscriptions,workspaces}` 域契约集中分布一致；authorization/platform 顶层先例系「非域模块的全局裁决/门面层」，tenants 是业务域故归 `modules/`）。
  - **乙 · quota 契约粒度**＝**采建议档**：整目录迁 `libs/core/src/modules/subscriptions/quota/*`（含 `tenant-plans`·不拆防碎片化）。
  - **丙 · e2e 归属**＝**采建议档**：`seat-quota-member.e2e`→subscriptions（FR-7 主链）·`tenant-hard-delete.e2e`→tenants（治理链）。
- 审计人 / 日期：人（「按建议自裁」）· 2026-10-17

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A 取证留痕：QuotaGuard/@Quota 在非 tenancy 面**零挂载触点**；event-type-registry 仅 3 行 import 随 sweep；table-ownership 预演坐实**零改动**（写侧仅 nativeUpdate(Organization/UserStatus)·迁 tenants 后推导不变；quota store 纯读侧·迁 subscriptions 不触红牌）；甲乙丙按建议档落定（人「按建议自裁」）。
- [x] `@core/saas-kit/tenancy/{lifecycle,quota}/*` 旧路径全仓零引用（grep 实测）；符号名零改动；core 内相对引用（subscriptions 自引/platform/tenancy middleware）全部改指新家（深度两轮实跑 tsc 校正）。
- [x] `apps/api/src/tenancy/` 仅余纯机制文件（context/guard/middleware/decorators/session + 相应测试）·TenancyModule docstring 与实存一致。
- [x] `TenantsModule`/`SubscriptionsModule` 接管装配（升 @Global+exports 保可见性）·整树 di-context 冒烟绿 + 两新家新锁测（摘/接同批落地）。
- [x] 宪法 ±zh 地图与目录实测对拍一致（树 tenancy 条目改「会话适配」+归位注·seats-quota 两句改指 subscriptions·主 plan 未决项 4 翻账 v0.7）。
- [x] `pnpm run ci` 全绿 **483/30（基线 481+2 只增不减）**·表所有权守卫绿·零迁移（checkSchema/DDL 恒等闸未触）；fallow `✓ No issues found` 零边界违规。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 起草（主线「继续推进 plan」） | 首版：未决项 4 落地立项。现状直查钉死（lifecycle/quota 契约与适配驻留清单、约 57 触点、两归宿模块已 @Global 的 DI 保形事实、QuotaGuard 无全局墙、table-ownership `tenancy/**` 推导源）；四切片（取证/core 迁址/装配归位/宪法同步）；甲乙丙待裁；高危 #2 双片 + #3 压 D 片。 |
| 2026-10-17 | 0.2.0 | 人「按建议自裁」→ 甲乙丙落定并全片实现 | **取证事实订正**：起草时「两归宿模块均已 @Global」系 grep 误读（命中 docstring 提及非装饰器）——实非 @Global；保形改道为两模块新贴 @Global+exports（沿 Authorization/Platform 先例·语义等价）。落地：core 契约迁 `modules/tenants/lifecycle`・`modules/subscriptions/quota`（含 tenant-plans）；api 三适配/五单测/两 e2e 归位；TenancyModule 摘至纯机制（context/guard/middleware/session/APP_GUARD）；两新家 wiring 锁测（整树 DB-free）。实现期 tsc 两轮校正相对深度（handlers 实为 3 档非 4）；Biome check:fix 后逐处甄别 `import type` 转换均为纯类型位（类值注入面零触动）。验收：`pnpm run ci` 全绿 **483/30（+2 只增不减）**·ownership 守卫零改动绿·fallow `✓ No issues found`。 |
| 2026-10-17 | 0.3.0 | 人「同意」→ 人类验收·结项 | 验收签核入库：提交 `9eec820`（含 amend 剔除误纳临时消息文件·强推归人裁档）已推 origin/main；README 索引同步翻「已验收·结项」；主 plan global-domain-context-refactor 追 v0.8 整案结项行。 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.0 变更，以当前正文内容为准。
