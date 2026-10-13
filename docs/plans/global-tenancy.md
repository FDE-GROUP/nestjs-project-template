# 多租户能力需求（Multi-Tenancy Requirements）

> 适用范围: `全局` ← blast radius，审计深度=人签核（`workflow.md` §3/§5）
> 关联: [vision.md](../specs/vision.md) §4.1 Tenancy / §7 阶段1 · [architecture.md](../specs/architecture.md)（垂直切片）· [workflow.md](../specs/workflow.md) §1/§3
> 性质: **技术方案（plan）**，重写型 · 版本 0.17.1 · 日期 2026-10-14 · 状态: **已审·开发依据·进行中（S0/S1/S2/S3/S4/S5/S6/S7/S8/S9 已落地·全栈 e2e 已分层收口（含跨租越界负向）·S10 边界已细化待审）**（`workflow.md` §3 已过审计门、人签核，见 §12）；D1–D6 全落定（§5）· §8-2 已清=混合复用（见 [`research/better-auth-org.md`](../research/better-auth-org.md)）· **S0/S1/S2/S3/S4/S5/S6/S7/S8/S9 已开工落地**（eafab76+c73e254+f310cfc+S2+0747efc+09496f1+971cd7c+1f773cd+10157e9+S7+S8+S9）· **S9 补遗：全栈 e2e 分层（boot 冒烟入 CI + env-gated 真 HTTP e2e）已拓 S2–S6 「全栈 e2e」挂账**
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表
> 受众: **人（方案主导）+ Agent（已审后为开发依据）**

---

## 0. 文档定位

本文是 [vision.md](../specs/vision.md) §7「阶段 1 · 租户域」的**技术方案**（已从 pre-plan 升级、**已过审计门** · §12），处于主流程链「技术方案 →（审计门）→ 垂直切片实现」的**实现入口**。§9–§11 为方案主体，§10 为垂直切片（S0–S10）；依 `workflow.md` 铁律，现为**开发依据**，可开工；首片 **S0**（挂 `organization()` 插件 boot + 租户上下文骨架），其中 schema migrate 属高危#1、逐次人工审后执行。

## 1. 背景与问题

当前模板是**单租户**：`users` / auth / stripe / storage 无租户维度。要成为 SaaS 底座，须引入**租户（tenant）**作为数据、身份、计费、配额、合规的统一隔离与归属单元，并让**租户上下文贯穿**一次请求的全生命周期（鉴权 → 数据访问 → 计费入账 → 日志）。

核心难点：① 隔离强度 vs 运维/查询成本的权衡；② 租户边界不可被越过（IDOR/串租）；③ 迁移要同时作用于 N 个租户；④ 现有 Better Auth / Stripe / Drizzle 的多租户化改造。

## 2. 目标 / 非目标

**目标**
- 建立租户领域模型与**租户上下文**横切机制（请求 scope / AsyncLocalStorage）。
- 数据**按租户隔离**且默认不可跨租；身份与授权收敛到「租户内成员 + 角色」。
- 租户**生命周期**可管理（**审批制**）：客户注册为 user → 申请 → 平台经营者人工认证 → 生效 → 暂停 / 删除；**非自助即时开通**。
- 为**计费 / 配额 / 合规**预留挂钩点（本阶段只挂钩、不实现全闭环）。

**非目标（本阶段）**
- **不做** schema / db 物理隔离（**D1 已裁决：行级 `tenant_id` 为唯一策略**）；
- 不做租户自助计费 UI / 账单门户；
- 不做跨租户数据分析 / 数仓；
- 不引入多区域数据驻留（合规留阶段 3）。

## 3. 领域词汇（tenant 相关）

| 词 | 含义 |
|----|------|
| **Tenant（租户）** | 顶层隔离与归属单元（付费主体）；所有业务数据挂 `tenant_id` |
| **Owner（租户所有者）** | 创建申请人经审批通过即成为首名 owner；最高租户级角色（见 FR-12） |
| **Workspace（工作区）** | 租户内二级**数据分组**（D2 已裁决：两级 租户→工作区）：业务表挂 `workspace_id`，查询默认按 `(tenant_id, workspace_id)` 复合过滤（**强数据边界**，workspace 间默认互不可见）；**无独立角色/权限层**，访问权由租户级权限判定（守 CL-5 三层） |
| **Member（成员）** | user × tenant 的**多对多关系**，带该租户内角色；一个 user 可属**多个租户**、角色互不相干 |
| **Membership 生命周期** | 申请（待批）/ 受邀（待接受）→ 激活 → 分配角色 → **退出仅解除该 membership，user 仍是平台用户** |
| **Role / Permission** | 租户内 RBAC 角色与权限集（租户级，见 FR-4/FR-11） |
| **权限层级（Permission Scope）** | 三层：**平台级**（经营者跨租户治理）· **租户级**（(user,tenant) 角色）· **用户级**（绑定用户身份、与租户无关）；各自 fail-closed、互不授予（FR-11） |
| **User（平台用户）** | 在本平台注册的账号；**先成为 user，方可申请 / 关联租户**；可被平台经营者暂停（暂停后全局失权） |
| **Platform Operator（平台经营者）** | **全局唯一**的系统管理身份，**由开发者设定、系统初始化（seed）时创建**，不可自助注册 / 不由他人任命；统一管理租户与用户：审批 / 列表 / **暂停·恢复（租户、用户）** / 删除 / 诊断；**区别于租户内 admin** |
| **Plan / Tier（套餐）** | 决定配额与特性开关的档位 |
| **Quota / Usage（配额/用量）** | 每租户资源计量（用户数、存储、API 调用…） |

> 词表**已并入** [`specs/glossary.md`](../specs/glossary.md)（项目级术语 **SSOT**）；**本表以 glossary 为准**，新词/改词先改 glossary、再回写本表（防双 SSOT 漂移）。冲突词已当场锐化。

## 4. 需求

### 4.1 功能需求（FR）

- **FR-1 租户生命周期（审批制）**：客户先注册为平台 user → 申请成为租户 → **平台经营者人工认证 / 审批** → 通过后租户生效；后续可配置 / 暂停 / 恢复 / 删除（软删 + 定期硬删）。**不得自助即时开通**。
- **FR-2 租户上下文贯穿**：每次请求解析出当前租户（源于认证会话：`getSession` 带出的 `activeOrganizationId`，header 可临时覆盖 / 子域名留前端，见 §5 决策4），注入作用域（AsyncLocalStorage），供数据层与下游消费；解析顺序遵循 FR-11——先认证平台用户（用户级）→ 再确定目标租户与 membership（租户级）。
- **FR-3 成员与加入**：成员来自平台已注册用户；准入方式 = **申请 + 受邀**并存：① user 可申请加入一个或多个租户，**由该租户管理者审批**是否接受；② 租户管理者可邀请（email / 链接）平台用户加入，被邀请者接受前不生效；**受邀 email 若未注册，接受时须先完成注册再落地 membership**。加入已有租户**不需平台经营者审批**（平台审批仅用于「创建租户」，见 FR-1）；**退出某租户仅解除该 membership，user 仍是平台用户**；租户管理者管理本租户成员。
- **FR-4 角色与授权（RBAC，租户内）**：角色是 **(user, tenant) 维度**——同一 user 在不同租户可持不同角色；由**该租户管理者分配，仅限本租户范围，不得跨租户分配**；授权校验在切片内统一执行（含**租户 / 用户暂停态**裁决，见 FR-10），禁止散点特判；退出后对该租户的访问即时失效。
- **FR-5 数据隔离强制**：所有业务查询默认被 `tenant_id` 约束（D1）；因 D2 两级 + 强数据边界，再按 `workspace_id` 复合过滤（租户内 workspace 间默认互不可见）；提供**防越权守卫**（漏挂 tenant/workspace 过滤即红）。workspace **不设独立角色层**，访问权由租户级权限判定（见 FR-4/FR-11）。
- **FR-6 平台经营者视图**：**统一管理所有租户与平台用户**——审批申请、跨租户/用户列表、详情、**暂停 / 恢复（租户、用户）**、删除、按租户诊断（受严格审计）。
- **FR-7 配额与限流挂钩**：读写路径经用量计量点，超限拒绝（配额值来自 Plan）。
- **FR-8 计费挂钩（占位）**：租户关联**订阅 / 客户**；支付经**多通道 provider 抽象**（Stripe 海外 + 微信 / 支付宝 大陆，见 [global-cn-adaptation](./global-cn-adaptation.md)），不绑定单一通道；本阶段仅打通 `tenant ↔ customer/subscription` 映射，不建账单 UI。
- **FR-9 特性开关**：按 Plan/租户读取特性开关，驱动可插拔行为，不污染核心切片。
- **FR-10 平台级暂停（fail-closed）**：平台经营者可**暂停租户**（该租户及其全体成员对该租户访问即时失效）或**暂停平台用户**（该用户在**所有租户**及平台侧的权限即时失效）；恢复即生效。暂停态为全局裁决，授权守卫须统一校验（见 FR-2/FR-4），不得散点特判。
- **FR-11 权限三层模型（Permission Scope）**：平台权限分三层、各自 fail-closed、互不授予——① **平台级**：平台经营者的跨租户治理（审批、暂停/恢复、删除、运营查看），不绑定单一租户上下文；② **租户级**：租户内 (user, tenant) 角色与权限，由该租户管理者分配、严格限本租户；③ **用户级**：绑定平台用户自身身份、与是否属某租户无关的能力（管理个人档案、申请创建租户、浏览/申请加入租户、切换所属租户）。校验顺序：认证用户（用户级）→ 解析目标租户与 membership（租户级）→ 平台运营接口校验平台级。暂停联动：暂停用户→用户级与所有租户级失权；暂停租户→该租户内租户级失权。
- **FR-12 租户 Owner 规则**：创建申请人经审批通过即为首名 **owner**；owner 可转移、可多名，但**须至少保留一名**；owner 退出本租户前**须先移交**，否则由**平台经营者介入接管**，不允许无 owner 真空。
- **FR-13 平台经营者身份（全局唯一）**：平台级权限只归属**唯一一个** Platform Operator——**由开发者设定、系统初始化（seed）时创建**，**不可自助注册、不由他人任命 / 增删**（变更 / 恢复由开发者经配置完成，无需互任机制）；所有平台级动作（FR-1/6/10/11）均由该唯一经营者执行。

### 4.2 非功能需求（NFR）

- **NFR-1 安全边界**：跨租户访问**默认失败**（fail-closed）；每个租户相关接口须有「越界」回归测试（IDOR）；**暂停租户 / 用户后相应访问全红**（须回归）。
- **NFR-2 性能不退化**：行级隔离下高频查询须走 `tenant_id` 复合索引；P95 不因租户维度显著上升。
- **NFR-3 迁移可回滚**：行级共享表 = **单一 schema**，迁移走常规 Drizzle migrate（无 per-tenant schema fan-out），须可回滚 + 存量数据 `tenant_id` 回填。
- **NFR-4 可观测**：日志/指标带 `tenant_id` 维度，可按租户排障（pino 结构化字段）。
- **NFR-5 可扩展**：租户规模增长时支持水平扩展；连接池按档位可配。
- **NFR-6 合规预留**：数据导出 / 删除以**租户**为单位可执行（GDPR 被遗忘权，实现留阶段 3）；**PIPL 按自然人 user** 的查阅/导出/删除见 [global-cn-adaptation](./global-cn-adaptation.md) FR-7（与按租户维度不同）。
- **NFR-7 隔离可测试**：DI/请求上下文有集成测试覆盖（对齐既有「Nest DI 集成测试」规范与 `design:paramtypes` 回归）。

## 5. 关键设计决策（**gate，待裁决**——决定方案形态，须人签核）

> 直接对应 [vision.md](../specs/vision.md) §8。下列未定前，本需求**不得进入技术方案实现**。

| # | 决策 | 选项 | 影响 / 我的倾向 |
|---|------|------|----------------|
| **D1** ✅ | **数据隔离策略** | **已裁决：仅行级 `tenant_id`（共享表）**；**不做** schema-per-tenant / db-per-tenant | 隔离靠贯穿的租户上下文 + 数据层强制约束 + 复合索引；迁移为统一单 schema |
| **D2** ✅ | **租户层级** | **已裁决：两级 租户(tenant) → 工作区(workspace)；workspace=纯数据分组(C) + 强数据边界(A)** | 领域模型含 workspace 聚合；业务数据挂 `workspace_id` 默认过滤；**不新增第四层权限**（见 §8.6）|
| **D3** ✅ | **成员模型** | **已定向（CL-2/CL-3）：user 独立存在，经 membership 多对多关联；可加入多租户、角色按 (user,tenant)、退出仅解除 membership** | 复用现有 users + Better Auth；区分「创建租户=审批」与「加入租户=自由」 |
| **D4** ✅ | **租户识别方式** | **已裁决（v0.3.0 修正）：cookie + 服务端 DB session 为主 + 可覆盖 header**（多租户用户切换） | 与代码实态一致（`SessionGuard → auth.api.getSession({headers})`，本仓无状态 JWT）；active tenant 取自 **session.activeOrganizationId**（Better Auth org 插件原生），注入上下文零 claim 改造；切换走 `/organization/set-active`；**FR-10 fail-closed 暂停 = 失效 session 行**；子域名 / URL 段留前端可选；若未来需无状态 JWT 再演进（本期不做）。修正缘由见 [`research/better-auth-org.md` §6](../research/better-auth-org.md) |
| **D5** ✅ | **计费模型优先级** | **已裁决：订阅 + 配额**先行 | 支付经多通道 provider（Stripe/微信/支付宝，见 global-cn-adaptation）挂 tenant 订阅；配额驱动 FR-7；计量制留后 |
| **D6** ✅ | **交付形态** | **已裁决：core 库 + 参考应用两包** | monorepo 拆分：`core`=多租户能力库，参考应用消费之；影响包结构 / 构建 / 发布（见 §8.7） |

## 6. 阶段 1 优先级（MoSCoW）

- **Must**：D1–D4 决策落定；FR-1/2/3/4/5/11/12/13 + NFR-1/3/7（租户模型、上下文、成员、RBAC、**三层权限**、Owner、经营者身份、行级隔离与安全边界、迁移、可测）。
- **Should**：FR-6 运营视图、FR-7 配额挂钩、FR-10 平台暂停、NFR-2/4。
- **Could**：FR-8 计费映射、FR-9 特性开关（若 D5/D6 明确）。
- **Won't**：账单 UI、跨租分析、多区域驻留；schema/db-per-tenant 物理隔离**全局排除**（D1）。

## 7. 完成判据（草拟，可核验 + 穷尽）

> 需求「完成」= 决策齐 + 可转 plan；阶段 1 落地「完成」另计。

- [x] D1–D6 全部裁决并回写本文（重写型）；
- [x] 每条 Must FR/NFR 有对应「垂直切片」映射（无遗漏）→ 见 §10；
- [x] 术语表并入 `docs/specs/`（GLOSSARY）→ 已建 [`specs/glossary.md`](../specs/glossary.md)（项目级术语 SSOT）；冲突词已消解（Tenant=organization 等）。
- [x] 本文已补 §方案/切片/影响面，升级为正式 plan（§9–§11）；**索引置「已审计」前不写码**。

## 8. 未决问题（讨论中）

1. **（依 D3+CL-2 已定方向）users 表保持平台全局、不加 `tenant_id`**；租户维度落在**业务表 + `membership`(user×tenant) 关联表**。待细化：membership / RBAC 表设计与迁移。
2. Better Auth 的 organization / teams 插件能否直接承载 membership/RBAC，减少自建？→ **已产调研 [`research/better-auth-org.md`](../research/better-auth-org.md)（仅参考、非依据）**：倾向 **混合复用**——复用 org 承载 tenant 实体 + membership(D3) + 受邀 + 租户内 RBAC(FR-4)，自建 隔离守卫(FR-5)/workspace 边界(D2)/审批生命周期(FR-1)/订阅配额(D5)/三层权限另两层(FR-11/13)/fail-closed 暂停(FR-10)/Owner 治理(FR-12)；`team` 不复用于 workspace。**结论须人二判 + 最小 spike（JWT↔activeOrganizationId 接缝）坐实后方可写入技术方案。**
3. **（依 CL-3 已明确）租户内 admin 权限严格限本租户、不可跨租；平台经营者只管租户级生命周期与运营，默认不进入租户内业务数据**（如需进入须显式授权 + 审计）。
4. **（依 D3）用户 email 为平台全局唯一，`users.email` 保持全局唯一约束**；`(tenant_id, …)` 复合唯一用于**租户内业务实体**（如租户内 slug / 邀请 token），非 user email。待列：哪些业务表需复合唯一 + 影响校验 / i18n。
5. **平台用户注册与信任分级**（**另行专题讨论**，属 vision Identity 支柱、跨切多租户）：初步意见——用户**分等级**、**准入宽松（仅邮箱认证）**、**逐步提升等级**。与本文关系：① 决定 FR-3「受邀未注册者接受时注册」的门槛与反滥用；② 用户等级可约束**用户级能力**（如能否申请创建租户）；③ 注意两个门不同：平台注册=宽松准入 vs 创建租户=平台人工审批（FR-1）。待开独立 plan（`global-user-registration`）。
6. **（依 D2 已裁决：C+A）workspace = 租户内二级数据分组**：业务表挂 `workspace_id`、查询默认按 `(tenant_id, workspace_id)` 复合过滤（强边界，workspace 间默认互不可见）；**不设 workspace 独立角色层**，访问权由租户级权限判定（守 CL-5 三层）。待细化：用户对哪些 workspace 有可见权（数据作用域映射）的表设计，落 plan。
7. **交付两包落地**（依 D6）：monorepo 拆 `core`（多租户能力库）+ 参考应用；影响包结构 / 构建 / 发布（可能与 `architecture.md` 的垂直切片目录共存的布局需协调）。**→ 边界已细化（v0.17.0·见 §9.5）：现状装配实测 + core 候选 + 三处硬耦合热点 + 依赖方向 + P0/P1/P2 分阶段预案已盘；「仅抽 core」采何力度（尤其 §9.5.4 ①schema/DrizzleService 归属、②物理 vs 逻辑边界）归人·待审计门签核。S10 仍**未开工**（本轮只盘边界·不动代码）。**

## 9. 方案设计（技术方案主体 · 待审计）

> 地基选型 = **混合复用**（依 [§8-2 调研](../research/better-auth-org.md)）：复用 Better Auth `organization` 插件承载 tenant 实体 / membership / 受邀 / 租户内 RBAC / activeOrganizationId；隔离守卫、workspace 边界、审批生命周期、订阅配额、平台/用户级权限、fail-closed、Owner 治理自建。

### 9.1 复用 / 自建边界

| 关注点 | 归属 | 承载 |
|--------|------|------|
| tenant 实体 | **复用** | org 插件 `organization` 表（= Tenant；`slug`/`metadata` 存租户元） |
| membership (user×tenant) | **复用** | org 插件 `member`（userId, organizationId, role） |
| 受邀 (invitation) | **复用** | org 插件 `invitation`（email 锚、pending/accept/reject） |
| 租户内 RBAC (租户级) | **复用** | org `ac` + roles(owner/admin/member/自定义) + `hasPermission` |
| active tenant | **复用** | `session.activeOrganizationId`（D4 session-cookie）+ `/organization/set-active` |
| **申请加入**（user→tenant 方向） | **自建** | org 无 join-request，建 `join_request` 表（见 9.4） |
| 数据隔离强制 (FR-5) | **自建** | 业务表 `tenant_id`/`workspace_id` + 查询守卫（见 9.3） |
| workspace 边界 (D2) | **自建** | `workspace` 表（**不复用 org `team`**，避免第四层权限） |
| 审批制生命周期 (FR-1) | **自建** | `organization.metadata.status` 状态机 + 平台审批端点 |
| 订阅 / 配额 (D5/FR-7/8) | **自建** | `tenant_subscription` + 用量计量点（挂 orgId） |
| 平台级 / 用户级权限 (FR-11/13) | **自建** | 沿用 `user.role`→平台级（seed 唯一 operator）+ 用户级能力 |
| fail-closed 暂停 (FR-10) | **自建** | 失效 session 行 + 守卫校验 status |
| Owner 治理 (FR-12) | **自建** | 基于 org `owner` 角色 + 移交/保底规则 |

### 9.2 数据模型

- **org 侧（复用、auth schema）**：`organization` / `member` / `invitation` / `session.activeOrganizationId`。**Tenant = organization**（不另建 tenant 表，避免双写；租户扩展字段走 `organization.metadata` 或经 `schema` 选项增列）。
- **workspace（自建、业务侧）**：`workspace(id, organizationId→tenant, name, slug, createdAt…)`，`(organizationId, slug)` 复合唯一；租户内二级分组。
- **业务表通用列（自建）**：所有租户内业务表加 `tenant_id`(=`organization.id`) + `workspace_id` + 复合索引 `(tenant_id, workspace_id, …)`（NFR-2）。**`users` 表不加 `tenant_id`**（D3/§8-1，保持平台全局）。
- **订阅 / 配额（自建）**：`tenant_subscription(id, tenant_id, plan/tier, status, seats/storage/apiQuota 限额, periodEnd…)`；`usage` 计量点（按 tenant 聚合）。支付经多通道 provider 抽象（挂 [global-cn-adaptation](./global-cn-adaptation.md) `PaymentProvider`，Stripe 先行、支付宝/微信 D9 暂缓）。
- **平台经营者（自建）**：`user.role=ADMIN` 演化为**平台级 operator**，由 `prisma/seed`（→Drizzle seed）初始化**全局唯一**、不可自助注册（FR-13）。

### 9.3 租户上下文贯穿 + 隔离守卫

- **上下文**：`TenantContextMiddleware`（或拦截器）在 `SessionGuard` 之后运行，从 `getSession` 结果读 `activeOrganizationId`（header 可临时覆盖，D4）→ 写入 **AsyncLocalStorage** `TenantContext { tenantId, workspaceId?, userId, roles }`（FR-2）。
- **隔离守卫（FR-5/NFR-1）**：`TenantScopeGuard` + Drizzle 查询层强制注入 `tenant_id`（必要时 `workspace_id`）谓词；**fail-closed**：无 `TenantContext` 即拒；提供越权回归测试（漏挂过滤即红）。org `hasPermission` 供**租户级** RBAC 判定，统一在守卫层封装（禁散点特判，FR-4）。

### 9.4 生命周期与状态机

- **租户（FR-1 审批制）**：`pending_approval` →（平台 operator 人工审批）→ `active` ⇄ `suspended` → `deleted`（软删 + 定期硬删）。**申请**落 `join_request`/`organization.metadata`；加入已有租户由租户管理者审批、不需平台审批。
- **成员（FR-3）**：受邀=`invitation`（接受前不生效；受邀 email 未注册→接受时先注册）；申请=`join_request`(user→tenant, 待租户管理者批)。退出仅删 membership。
- **fail-closed 暂停（FR-10）**：暂停租户/用户 → 置 status + **删除/失效其 session 行**（D4 session 模式即时失权）；守卫统一校验，勿散点。
- **Owner（FR-12）**：首名 owner=创建申请人；转移/多名、**至少保留一名**；退出前须移交，否则平台 operator 接管。

### 9.5 交付形态（D6 两包 · 解 §8-7）

> **本片状态：边界先行·仅抽 core（S10 · 人裁口径）** —— 现仅**盘点拆分边界与耦合热点、产出可审设计**，**不动代码·不触构建发布链**；下列为**开发依据草案·待审计门人签核**（尤其 §9.5.4 四项开放决定归人）。

**9.5.1 现状事实（装配面实测·非臆测）**
- 单一包：`package.json` **无 `workspaces`**；`tsconfig.json` 已声明 `paths` 别名（`@app/*→src/*`·`@core/*→src/core/*`·`@shared-kernel/*`·`@modules/*` 等），其中 **`@core/*` 指向不存在的 `src/core`（0 处引用）**——别名预留≠物理分包。
- `nest-cli.json` 单 `sourceRoot: src`；`main.ts` 于进程入口 `NestFactory.create(AppModule)` + dotenv + 数据驻留校验 + Fastify 插件挂载 + Swagger（均为**应用级编排**·非 core）。
- `TenancyModule` 为 `@Global`、bind `TenantMiddleware.forRoutes('*')`；全仓 **53 个文件** import `@app/tenancy`。
- `src/database/schema.ts` = **单文件混装**：core 相关表（`organization`/`member`/`invitation`/`workspace`/`userStatus`/`tenantSubscription` + BA 内核 `session`/`account`/`verification`）与**参考样例表**（`post`·通用 `user`·`consent`）同处一文件。

**9.5.2 core 候选内容（能力库·`packages/core`）**
- `shared-kernel`（框架无关 domain/CQRS 基类·天然属 core·0 反向依赖）；
- `tenancy`：ALS `TenantContextService` + `TenantMiddleware` + 三层守卫（`TenantScopeGuard`/`TenantPermissionGuard`/`PlatformOperatorGuard`/`SessionGuard` 契约）+ RBAC(`permissions`) + lifecycle(`TenantStatusService`/`UserStatusService`/状态机) + quota(`QuotaService`/`QuotaGuard`) + `PlatformAuditService`；
- Better Auth **organization 集成**的**能力部分**（`organization({ac,roles})` 声明、`resolveRequestSession` 抽象）。

**9.5.3 关键张力：core 并不自给自足（三处硬耦合热点·抽取的真成本）**
1. **DB/schema**：core 服务直接 `import` 具体 `DrizzleService` 与 `schema` 表（`tenant-status.service`→`organization`；`quota.service`→`member,tenantSubscription`；`platform-operator.guard`→`user`）。→ 须先**拆 schema**（core 表 vs 应用表分文件）+ 决定 `DrizzleService` 归属（见 9.5.4 ①）。
2. **Auth 会话**：`TenantMiddleware`/`PlatformOperatorGuard`/`TenantPermissionGuard` 依赖 `@app/modules/auth` 的 `AuthInstanceInjectKey` + `resolveRequestSession`（Better Auth 实例）。→ core 应消费**注入的会话端口**，Better Auth 具体实例由参考应用装配（DI token 契约跨包）。
3. **Config**：`PlatformOperatorGuard` 取 `ConfigService.getPlatformConfig()`。→ core 依赖 `ConfigService` 抽象（或最小化 env 端口），具体 env 加载留应用。

**9.5.4 开放待裁（归人·审计门）——「仅抽 core」的三种力度**
- **① schema 与 DrizzleService 归属**：(A) core 自带 `DrizzleService`+core 表模块（core 更重·含 infra）；(B) core 只依赖**仓储端口**、schema/连接留应用（真解耦·改动最大）；(C) 折中——core 携 `schema-core.ts`（org/member/workspace/subscription/userStatus/BA 内核表）+ 端口，样例表 `post` 与连接实现留应用。**推荐 C**（贴合「边界先行」）。
- **② 物理 vs 逻辑边界**：是否此刻就建 `workspaces` 物理拆目录，还是**先以 `@core/*` 路径别名 + 依赖方向 lint/`fallow` 边界规则锁定逻辑边界**（0 构建改动·可先行验收「依赖边界清晰」），物理 `packages/` 留后续。此即「边界先行」字面落地·**blast radius 最小**。
- **③ 包名/发布形态**：git workspace 私有包 vs 占位 npm 名（D6 已允「包名为占位可微调」）。
- **④ workspace/subscription 领域切片归属**：`src/modules/workspaces`、`src/modules/subscriptions`（CQRS 参考实现）归 core 暴露还是留参考应用示例。

**9.5.5 依赖方向（目标态·单向）**
`apps/reference`（`main.ts` bootstrap·`AppModule` 装配·storage/payment/i18n/mailer/users/posts 样例·seed·drizzle 连接实现）→ **依赖** → `packages/core`（tenancy 能力 + shared-kernel + schema-core + 会话/配置端口契约）→ **依赖** → peer（`@nestjs/*`·`drizzle-orm`·`better-auth`·`postgres`）。core **MUST NOT** 反向 import 样例（`post`/`users` 控制器）或 `main.ts`。

**9.5.6 落地步骤（分阶段·设计预案·未执行）**
1. **阶段 P0（逻辑边界·推荐先做）**：填 `@core/*` 别名实际指向、建 core↔reference **依赖方向守卫**（`fallow`/边界 lint 规则·进 CI），把「哪些符号属 core 公共面」用显式 barrel/index 收口；**不物理移文件**·0 构建链改动。验收 = 「依赖边界清晰」（§10 S10 判据之一）可先行转绿。
2. **阶段 P1（schema 拆分）**：`schema.ts` 分 `schema-core.ts` / 应用 `schema.ts`，逐表归位（采 9.5.4①C）；仅文件重组·**不动 migrate**（表/列定义不变→`drizzle:generate` 应产 no-op·高危#1 仍逐次守）。
3. **阶段 P2（物理分包）**：建 `packages/core` + `apps/reference` workspaces，`DrizzleService`/会话实例改由应用经 DI 端口注入；改 `nest-cli`/`tsconfig`/构建发布链。**高危·blast radius 最大·须人放行**。
- **风险登记**：P2 触及构建发布链（全局 blast radius）；单测/CI 现依赖 `@app/*` 别名与 `@Global` 单包作用域，物理分包后 DI 作用域与 `design:paramtypes` 元数据（见 S9 bug 族）须重验；schema 拆分若误触列定义→迁移漂移（高危#1）。故**建议止步 P0（或至多 P1）作为本片交付**，P2 另立开工门待裁。

> **本节为边界盘点·非既成实现**：S10 保持「未开工」，直至 §9.5.4 四项开放决定经人签核；若裁「仅 P0 逻辑边界」，则近乎零代码改动即可满足 §10 S10 之「依赖边界清晰」判据，「构建/发布绿」判据随 P2 才生效。

### 9.6 三层权限收口（FR-11 · S8）

- **收口形态（务实）**：三层各自一守卫、逐路由 opt-in（**不新增 PermissionScope 抽象守卫、不接全局 `APP_GUARD`**·高危#4 继挂账）——用户级 `SessionGuard`（401 无会话/403 暂停）·租户级 `TenantScopeGuard`+`TenantPermissionGuard`（无 tenant 即 403·权限委派 BA `hasPermission` 单源）·平台级 `PlatformOperatorGuard`（DB email 命中 `platform.operatorEmail`·无关租户角色）。暂停联动统一经 `isBlocked`（S6）。
- **无散点据实坐实**（S8 全仓 grep）：未发现绕过守卫的内联权限硬判——无散点 `role === 'ADMIN'`（S4 过渡判据已于 S5 收敛为 email 命中）、`user.role` 仅出现在用户聚合/映射/仓储（非裁决）、`hasPermission(` 仅在 `auth.implement` 透传与 `TenantPermissionGuard`、`operatorEmail` 仅在 config/seed/`PlatformOperatorGuard`。故「禁散点」已成立，S8 以回归矩阵而非新实现锁死。
- **单认证解析面**：`src/modules/auth/session-resolver.ts` 的 `resolveRequestSession(auth, req)` 以 `WeakMap` 按请求记忆会话，`TenantMiddleware`/`SessionGuard`/`PlatformOperatorGuard` 三处复用→每请求一次 `getSession`（原本三重）；函数仅转发 BA `getSession` 不做裁决，各调用方保留自身 401/403/DB-email 语义（行为不变）。
- **互不授予回归**：`src/tenancy/three-layer-permission.matrix.test.ts` 以真实守卫类+ALS 真路径矩阵断言 ①各层 fail-closed ②互不授予（operator 无 activeOrganizationId 进不了租户路由·租户 admin email 不命中不得平台权·用户级只绑自身）③暂停三层联动失权。一旦合并/改接线顺序/引入散点特判即红。

## 10. 垂直切片映射（Must FR/NFR → 切片 → 依赖 → 验收）

| 切片 | 内容 | 覆盖 FR/NFR | 依赖 | 验收（可核验） |
|------|------|-------------|------|----------------|
| **S0 租户上下文骨架** ✅ | org 插件接入 + TenantContext(ALS) + TenantMiddleware 读 activeOrganizationId | FR-2, D4 | §8-2 spike 通过 | ✅已落地（eafab76）：真实库往返验 getSession 带出 activeOrganizationId·owner 自动入会·零 claim |
| **S1 membership + 租户级 RBAC** ✅ | 复用 member/invitation/ac/roles；受邀接受落地 | FR-3, FR-4 | S0 | ✅已落地（f310cfc）：`@RequirePermissions`+`TenantPermissionGuard` 委派 BA `hasPermission`（ac/roles 为唯一权限源、禁散点）·fail-closed 无租户即 403·真实库冒烟坐实返回 `{success:boolean}`；org member/invitation 端点 S0 挂载后即 live |
| **S2 数据隔离强制** ✅ | 业务表加 `tenant_id` + `TenantScopeGuard` + 复合索引 | FR-5, NFR-1/2 | S0 | ✅已落地：`post` 加 `organizationId`（0004 纯additive·逐条 apply）·`TenantScopeGuard` fail-closed 403·**仓储层为唯一隔离卡点**（port 不暴露 tenant、adapter 从 ALS requireTenantId 强制过滤/写）·post CQRS 参考切片·越界回归单测（漏挂 where 即红）。*待决*：全局 APP_GUARD（高危#4）、NOT NULL 收紧、全栈 e2e |
| **S3 workspace 二级边界** ✅ | `workspace` 表 + `(tenant_id,workspace_id)` 复合过滤 | D2, FR-5, §8-6 | S2 | ✅已落地（0747efc）：`workspace` 表（orgId FK cascade·`(orgId,slug)` 复合唯一）+ `post.workspaceId`（可空·FK set null）+ 复合索引 `(organizationId,workspaceId)`（`0005` 纯additive·人已审·事务内逐条 apply·采①可空）；`TenantMiddleware` 读 `x-workspace-id` 绑定 ALS `workspaceId`（可选选择器·§9.2 header 覆盖）；**post 仓储唯一卡点升级为复合作用域**（有 ws 即 `AND workspaceId`·`organizationId` 恒取自可信 ctx→外部 ws 天然 0 行·跨租泄漏结构上不可能）；越界回归单测 +5。**workspace CRUD 参考切片（09496f1）**：扩 BA `ac` 增 `workspace` 资源（人裁口径：`read`=全成员·`create/update/delete`=owner+admin）+ `roles` 精确镜像 BA 默认集再叠加 workspace（因 `{...defaultRoles,...opts.roles}` 整组替换、既有 org 端点行为不变）+ CQRS 切片（port 不暴露 tenant·adapter 以 `organizationId` 为唯一隔离卡点·update/remove 复合作用域外租户 0 行）+ controller 逐路由 `@UseGuards(TenantScopeGuard,TenantPermissionGuard)`+`@RequirePermissions`（非全局·高危#4 留待）+ 隔离红线单测与 ac 角色矩阵单测 + i18n name/slug。*待决*：全局 APP_GUARD（高危#4）、`organizationId`/`workspaceId` NOT NULL 收紧、全栈 e2e |
| **S4 审批制租户生命周期** ✅ | 状态机 + 申请/审批端点 + Owner 规则 | FR-1, FR-12 | S1 | ✅已落地（971cd7c）：**封自助即时开通**——`organization({ allowUserToCreateOrganization:false })` 使 HTTP `/organization/create` 一律 403（FR-1）；建租户唯一通道=**服务端系统动作**（无 session+`body.userId`→`isSystemAction`·源码坐实不受此开关限）。状态存 `organization.metadata.status`（§9 提案·**无迁移**）：`pending_approval → active`（suspended/deleted 定义先行、由 S5/S6 驱动）。`src/modules/tenants` CQRS 参考切片：申请（用户级 `SessionGuard`·强制盖 pending）/审批（`TenantStatusService.transition`→active）/驳回（硬删 org 行·FK 级联清 member/invitation）端点，审批/驳回挂 **`PlatformOperatorGuard`**（过渡判据 `user.role===ADMIN`·S5 seed 唯一 operator 后正式化）。**TenantMiddleware deny-list 失能**：pending/suspended/deleted 租户不绑 tenantId→业务路由 fail-closed 403；无状态记录（存量/seeded）视同放行不锁 dev。Owner 保底（FR-12 最小面）：申请人经 BA 原生成首名 owner。单测 +25（状态机/guard/中间件失能/provisioning/handlers）·CI 30 files/144。*待决*：全栈 e2e 闭环、Owner 转移/退出保底（随 S5） |
| **S5 平台经营者治理** ✅ | seed 唯一 operator + 平台级端点(列表/详情/诊断/暂停/恢复/删除) | FR-6, FR-13 | S0/S4 | ✅已落地（1f773cd）：**平台判据正式化**——`PlatformOperatorGuard` 从过渡 `role=ADMIN` 收敛为「会话用户 DB email 命中 `platform.operatorEmail` 配置」·fail-closed（无会话 401/未配置·不命中·查无此人 403）；config 增 `platform.operatorEmail`（default+interface+getter+.env.example）·seed 幂等 upsert 该 email 保障唯一 operator 行。**状态机收紧**（§9.4）：`canTransition` 迁移表 + `TenantStatusService.transition` 严格裁决（ok/not-found/illegal·合并写回 metadata）。**治理切片**（FR-6）：跨租户列表/详情/诊断（member/invitation/workspace/post 计数）读侧 + suspend/resume/delete 写侧 CQRS 全套（port 不注入租户上下文·controller 逐路由挂 PlatformOperatorGuard·不挂 TenantScope·FR-11①三层分离）；**结构化审计单点** `PlatformAuditService`（pino 机读日志·不落新表→无迁移）。reject 收紧仅 pending 可驳（→409）；delete 采软删（deleted 终态·保留行供按租户导出/硬删·NFR-6）。无 schema 改动→不触 migrate（高危#1）；守卫逐路由局部接线→未动全局 APP_GUARD（高危#4）。单测 +27·CI 34 files/171。*待决*：暂停用户（user 侧失能·需 user 状态列→触 migrate·归 S6）、Owner 转移/退出保底、全栈 e2e |
| **S6 fail-closed 暂停** ✅ | 暂停租户/用户→失效 session + 守卫校验 | FR-10, NFR-1 | S2/S5 | ✅已落地（10157e9）：**租户侧**已由 S5 deny-list 覆盖（仅该租户失能·不超范围删 session）；**用户侧**为本次新增量——新独立表 `user_status`（0006 纯 additive·FK 级联·不动 Better Auth 的 `user` 表·采人裁「独立表」方案）·`UserStatusService` 读写唯一卡点（复用 §9.4 `canTransition` 迁移表·deny-list 缺行视同 active）；**三层失能统一经 `isBlocked`**（FR-11·禁散点）：`TenantMiddleware` 暂停用户不绑 tenant/identity、`SessionGuard` 403、`PlatformOperatorGuard` operator 自身亦校验；用户治理切片 suspend/resume commands+handlers（**suspend 硬删该用户全部 `session` 行**·D4/§159 即时失权·BA revokeSessions 仅作用于当前会话故直接 Drizzle 删）+ 跨平台用户列表 port/adapter/query + `PlatformUsersController`（逐路由 PlatformOperatorGuard·不挂 TenantScope·FR-11①）+ `PlatformAuditService.logUserGovernance`。migrate 采真库 push 口径直执 0006（本库 journal 空·历片均 push 管理）·真库往返验证 upsert/join/FK 通过。单测 +20（CI 37 files/191·0 边界违规）。*待决*：全局 APP_GUARD（高危#4）、NOT NULL 收紧、全栈 e2e、**schema 与实库漂移：`consent` 表本缺（早于 S6·非 S6 回归）** |
| **S7 订阅 / 配额挂钩** ✅ | `tenant_subscription` + 计量点（占位） | FR-7, FR-8, D5 | S1 | ✅已落地：新表 `tenant_subscription`（`0007` 纯 additive·14 列·`tenantId`→org FK cascade·`(tenantId,status)`+`(tenantId,periodStart)` 复合索引·**1:N 订阅历史**（裁①）·人已审 migrate apply）；`src/tenancy/quota`：`tenant-plans` 档位目录（free/pro/enterprise·`resolvePlanDef`）+ `QuotaService` 读写单点（`currentSubscription`/`effectiveSeatsLimit`/`currentSeats`=`COUNT(member)`（裁③）/`checkSeats`/`assertSeats` 超限抛 **402 PAYMENT_REQUIRED**/`snapshot`）·缺订阅**回落 FREE_PLAN 带限额**（裁②·非 fail-open）；`@Quota` 装饰器 + `QuotaGuard`（**opt-in 逐路由**·读 ALS tenantId·无即 403·不挂全局 APP_GUARD·高危#4 挂账）；`src/modules/subscriptions` CQRS 切片（port 不暴露 tenant·Drizzle adapter `requireTenantId()` 单点注入·`create` **实调 `PaymentService.createCustomer`** 落 `providerCustomerId` 映射（FR-8·裁②）·PaymentModule 设 `@Global` 避双实例）。**超限拒绝采基础设施+单测坐实**（成员增建全走 BA org 路由·无可控 Nest 写路由挂 QuotaGuard→BA member-add 生产挂点标为接线点·留后续切片）。真库往返 INSERT/1:N/免费档回落/FK cascade 通过·**往返抓到并修复 repo bug**（`updatedAt` NOT NULL 无 DB default·`$onUpdate` 仅 UPDATE 触发→INSERT 须显式盖章·对齐 `UserStatusService`）。单测 +25（CI 42 files/216·0 边界违规）。*待决*：全局 APP_GUARD（高危#4）、账单 UI/周期滚动/续费（P3/D9 暂缓） |
| **S8 三层权限收口** ✅ | 平台/租户/用户级统一裁决（禁散点） | FR-11 | S1/S2/S5 | ✅已落地（收口·无 schema 变更·不触 migrate）：人裁 B 务实收口 + 单解析面。据实盘点三层已高度收敛（各层一守卫·逐路由 opt-in·isBlocked 单点·BA hasPermission 单源·email 单点），全仓 grep **无散点内联权限硬判**（无 `role==='ADMIN'`·`user.role` 仅在聚合/映射/仓储非裁决）。交付：① `src/modules/auth/session-resolver.ts` 单认证解析面（`WeakMap` 按请求记忆·`TenantMiddleware`/`SessionGuard`/`PlatformOperatorGuard` 复用→每请求一次 `getSession`·原本三重·行为不变各留 401/403/DB-email 语义）；② `src/tenancy/three-layer-permission.matrix.test.ts` 三层互不授予/fail-closed/校验顺序矩阵（真实守卫类+ALS 真路径·+10 测）。**未新增 PermissionScope 抽象守卫·未接全局 APP_GUARD（高危#4 继挂账）**·`TenantPermissionGuard` 仍需 headers 调 BA固有不动。§9.6 补收口说明。CI 43 files/226·0 边界违规 |
| **S9 DI/上下文集成测试** ✅ | ALS + 守卫 e2e（对齐 `design:paramtypes` 回归） | NFR-7 | S0–S2 | ✅已落地：新建 `src/tenancy/di-context.integration.test.ts`（真实 `Test.createTestingModule` 解析整条鉴权栈 + ALS 传播），**拓出一个已编译入产的真实 bug**：`TenantScopeGuard`/`TenantPermissionGuard` 的构造参用 `import type`且**无 `@Inject` token**→swc `decoratorMetadata` 发出 `design:paramtypes=[Object]`（dist 已坐实 `typeof TenantContextService === "undefined" ? Object : ...` 且无对应值导入兜底）→Nest 无法实例化守卫·**所有 `@UseGuards` 路由启动即崩**（历片均手工 `new Guard` 单测、CI 无真 boot→未暴露）。修复=改显式 `@Inject(ClassToken)`+值导入（对齐 `PlatformOperatorGuard` 惯例·且防 biome `useImportType` 回吸）。回归测锁三层：①`design:paramtypes` 携真实类②DI 容器无手工 new 解析出实例③ALS 端到端（真中间件→守卫·含无cookie/暂停租户 fail-closed 403）。**无语义变更·不触 migrate（高危#1）·未接全局 APP_GUARD（高危#4）**。CI 44 files/232·0 边界违规 |
| **S9+ 全栈 e2e 收口**（S9 补遗·非独立片）✅ | DB-free boot 冒烟进 CI + env-gated 真 HTTP e2e | NFR-7, FR-5 | S9 | ✅已落地（收口 S2–S6 各片*待决*之「全栈 e2e」挂账·分层两测·无 schema 变更不触 migrate）：**第一层** `src/app-boot.smoke.test.ts`（DB-free·`Test.createTestingModule({imports:[AppModule]}).overrideProvider(DrizzleService)`·compile 整树 DI·断言三层守卫+SessionGuard+PostsController+ConfigModule 均可解析·`compile()` 不触发 `onModuleInit` 故免连库·**进默认 CI**）——**顺带拓出两个真 prod boot bug**：① `ConfigModule` 原非 `@Global`（只 `@nestjs/config` 内层 isGlobal·未 re-export 自定义 `ConfigService`）→`PlatformOperatorGuard` 注 `ConfigService` 但 `TenancyModule` 未 import ConfigModule → 真 boot 崩（修=加 `@Global()`）；② `QuotaGuard`（S7 遗留）三构造参 `import type`+无 `@Inject` token→`design:paramtypes=[Object]`→Nest 无法实例化（同 S9 bug 类·修=值导入+`@Inject` tokens）。**第二层** `src/tenancy/tenant-isolation.e2e.test.ts`（**env-gated**·仅 `E2E_DATABASE_URL` 存在时运行·真 `DrizzleService`/守卫/中间件/CQRS/仓储/Fastify 全真实件·只在认证令牌边界 override `AuthInstanceInjectKey.getSession` 依 cookie 返固定 session·夹具插 2 org+各 1 post·真 HTTP `app.inject` 打穿 `/posts`·断言跨租户互不可见 org_a 只见 ALPHA/org_b 只见 BRAVO/无 cookie 403·默认 CI `describe.skip` 不破 DB-free 不变量）。`vitest.config` `DATABASE_URL` 改外部可覆盖（`process.env.DATABASE_URL ?? test-db`）以支持 gated e2e 指向已 migrate 的 dev 库。boot 冒烟 1/1·gated e2e 真库 3/3·CI 全绿 46 files/236（3 gated skip）。*真实 Better Auth email/password 登录 + session cookie 编排仍留「全栈 CI 拼 PG」专项*；**后续增补越界负向 e2e（v0.17.1·gated +2 测）**：伪造 body `organizationId` 写→仓储强制盖可信租户且对端租户绝不可见（跨租写重定向失效）、伪造 `x-workspace-id` 选择器读→复合作用域恒 0 行（无法括宽/泄漏）——把 FR-5/NFR-1 跨租红线抬到**真实 HTTP 边界**（真库 5/5·默认 CI 仍 skip）。 |
| **S10 两包拆分** | core/参考应用 monorepo | D6, §8-7 | S0–S3 | **边界已细化（v0.17.0·仅盘不动码）**：§9.5 已出现状装配实测/core 候选/三处硬耦合热点/依赖方向/P0・P1・P2 分阶段预案；待裁 §9.5.4 四项（采何力度）后进开工门。**未开工**·构建/发布绿与依赖边界清晰为开工后判据 |

> **Should/Could 递延**：FR-9 特性开关（依 D5/Plan，Could）、NFR-4 观测 `tenant_id` 字段（Should，pino）、NFR-5 连接池按档位（可扩展性，后）；多区域驻留/账单 UI/跨租分析 **Won't**（§2/§6）。

## 11. 影响面与迁移

- **迁移策略（NFR-3）**：行级共享 = **单一 schema、无 per-tenant fan-out**，走常规 Drizzle migrate。**风险②已 S0 boot 坐实**（见 [research §7–§8](../research/better-auth-org.md)）：org 三表 + `session.activeOrganizationId` 并入手写单文件 `src/database/schema.ts`，`drizzle-kit generate` 产**纯 additive、FK 可解析** SQL（→ `0002`），runtime adapter 按列真实读写、`metadata` 为 **jsonb 真对象**（非 JSON string）、`activeOrganizationId` 无需额外 FK 均经真实库往返验证。
- **迁移口径（v0.12.1 定档）**：仓库 `drizzle/` 文件链（SQL + `meta/_journal.json`）= **schema 唯一真相**；空库/CI/生产走 `drizzle:migrate`，本地增量用 `generate`→`migrate` 保持库内 journal 与文件链同步（`push`/`db:reset` 不填 journal·仅应急）。本 dev 库已清库重建走 migrate 一致态；**S7 `0007`（tenant_subscription）经该口径正常 `generate`→`migrate` apply**（现 journal 8 行 0000→0007·12 表齐·S6 那套 push/手动 SQL 权宜已不需要）。详口径见 [`install&run.md` 迁移口径](../install&run.md)。
- **⚠️ S0 boot 撞出并采 A 修复（预存·非租户）**：`better-auth@1.7.7` 运行时 schema 校验（`advanced.database.validateSchema`·默认全环境开）要求手写 `session` 含 `ipAddress`/`userAgent`，缺则任何 auth API 抛 `SchemaMismatchError`；经人裁采 A（加两可空列→ `0003` 纯 additive、保留校验开），见 [`fix(auth)` 提交] 与 [research §8](../research/better-auth-org.md)。**推论：手写 Drizzle 承载 Better Auth 须字段与 BA 期望核心字段逐一对齐（升 BA 版为回归红线）。**
- **存量数据回填**：现仅 `post` 样例业务表——加 `tenant_id`/`workspace_id` 须**回填策略**（seed 期分配默认租户或标记 `unassigned`）；正式业务表上线即带列，无历史包袱。
- **auth 侧改造**：`auth.implement.ts` 挂 `organization({ ac, roles })` 插件；`SessionGuard` 扩展返回 `sessionUser + tenantContext`；与既有 genericOAuth(A1)/PIPL consent 共存无冲突。
- **D6 重构波及**：monorepo 拆分改 `package.json` workspaces / `nest-cli` / 构建发布链；与 `docs/specs/architecture.md` 垂直切片布局协调（本方案 §9.5）。
- **交叉引用**：FR-8 支付复用 [global-cn-adaptation](./global-cn-adaptation.md) `PaymentProvider`（Stripe 先行，支付宝/微信 **D9 劣后暂缓**）；受邀 email 依赖遇境内无 email 渠道（[cn-providers 风险①](../research/better-auth-cn-providers.md)）→ 需 email 外锚点，留实现期决。
- **审计门**：本 §9–§11 **已过审计门（人签核· v0.5.0）**，详 §12 审计记录；`docs/plans/README` 索引置「已审计·进行中（S0）」。开工首片 schema migrate 仍逐次守高危#1（不预授迁移）。

## 12. 审计记录（`workflow.md` §3）

- **审计结论**：**通过**（人签核）。方案可作开发依据；按 §10 垂直切片顺序开工，首片 **S0**（租户上下文骨架）。
- **审计人 / 日期**：FDE Team（人签核）· 2026-10-13。
- **§9 五项提案级决定**：**全部接受**（Tenant=organization 不另建表 / workspace 不复用 team / 审批状态存 `organization.metadata.status` / D6 包名为占位可开工时微调 / 存量 `post` 回填策略）。
- **高危项边界（重要）**：本次签核=批准**方案作为开发依据**；**不预先授权具体迁移**。开工首片的 schema migrate（`drizzle:generate` SQL 人工审 → `drizzle:migrate`）仍逐次守**高危清单 #1**（`workflow.md` §3）；`drizzle:push --force` 仅限 dev。
- **§8 未决处置**：#2 已清（research混合复用）·#1/#3/#4 已定向、细化落 §9 设计·#5（平台用户注册与信任分级）**另开独立 plan** `global-user-registration`（本期不做）·#6/#7 已落 §9.2/§9.5。
- **开工前置**：§7 四判据均 ✅（含术语并入 [`specs/glossary.md`](../specs/glossary.md)）；§11 风险②已离线 spike 坐实（见 [`research §7`](../research/better-auth-org.md)）。runtime adapter 映射 / `metadata` 列型待 S0 boot。

## 13. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-13 | 0.1.0 | 首版：从 vision 阶段 1 提炼多租户需求草案（讨论期澄清 D1/D3 与 CL-1~CL-5 属同一初稿形成，不单列） | 背景/目标/词汇/FR(1–11)·NFR/决策 gate(D1–D6)/MoSCoW/完成判据/未决 |
| 2026-10-13 | 0.2.0 | 地域适配决策（支付多通道）传导至本草案 | FR-8 / D5：计费挂钩由 Stripe 单挂 → 多通道 provider（Stripe/微信/支付宝，见 global-cn-adaptation） |
| 2026-10-13 | 0.3.0 | §8-2 spike（代码级核验）发现 D4「JWT claim 为主」与实态不符，经**人裁**修正 | **D4**：JWT claim 为主 → **cookie + 服务端 DB session 为主**（active tenant = session.activeOrganizationId）；FR-2 同步改措辞；§8-2 标混合复用已产 research |
| 2026-10-13 | 0.4.0 | 路径 C：起草技术方案主体、升级为正式 plan（待审计） | 新增 §9 方案设计（混合复用边界/数据模型/租户上下文/生命周期/两包）· §10 垂直切片映射(S0–S10)· §11 影响面与迁移；勾 §7 切片映射判据；§8-6/§8-7 落入设计 |
| 2026-10-13 | 0.5.0 | 新建 [`specs/glossary.md`](../specs/glossary.md) 术语 SSOT（勾除 §7 最后一判据）+ §11 风险②离线 spike 坐实 + **过审计门（人签核）** | 勾 §7 术语并入判据；§11 标风险②已坐实（纯 additive）；新增 §12 审计记录、演变顺延 §13；性质/版本/状改写为「已审·开发依据」；索引置「已审计·进行中（S0）」 |
| 2026-10-13 | 0.6.0 | **S0 落地（开工首片）** | schema 加 org 三表+`activeOrganizationId`（`0002`）·`auth.implement` 挂 `organization()`·新建 `src/tenancy`（ALS 上下文+中间件+@Global 模块）接 `app.module`（feat eafab76）；boot 冒烟撞出 BA 1.7.7 `validateSchema` 与 `session` 缺 `ipAddress`/`userAgent` 冲突，经人裁采 A 加两可空列（`0003`·fix c73e254）；真实库往返坐实 adapter/jsonb/D4 读路；回灌 §10 S0 ✅、§11、research §8 |
| 2026-10-13 | 0.7.0 | **S1 落地（租户级 RBAC）** | 新建 `src/tenancy/rbac`：`@RequirePermissions` 装饰器 + `TenantPermissionGuard`（fail-closed）+ `permissions.ts`（`toPermissionMap`）；`auth.implement` 透传 `hasPermission`、`TenancyModule` 注册导出（feat f310cfc）。以 BA org 插件 `ac`/roles 为唯一权限源（禁散点·§9.3）；局部 `@UseGuards` 非全局 APP_GUARD（高危#4 留 S2）；无 schema 变更。真实库冒烟纠正 `hasPermission` 返回为 `{success:boolean}`。回灌 §10 S1 ✅ |
| 2026-10-13 | 0.8.0 | **S2 落地（数据隔离强制）** | `post` 加 `organizationId`+复合索引（`0004` 纯additive·人已审·事务内逐条 apply·采选项①可空）；新建 `TenantScopeGuard`（fail-closed 403·局部 @UseGuards）+ `post` CQRS 参考切片（domain port 不暴露 tenant·Drizzle adapter 从 ALS requireTenantId 为唯一隔离卡点）+ i18n `validate.title.required`；越界回归单测（list/findById 谓词结构相等·无租户即拒·create 盖租户）。全局 APP_GUARD/NOT NULL 收紧/全栈 e2e 留待。回灌 §10 S2 ✅ |
| 2026-10-13 | 0.9.0 | **S3 落地（workspace 二级边界·复合作用域）** | schema 新增 `workspace` 表（orgId FK cascade·`(orgId,slug)` 复合唯一）+ `post.workspaceId`（可空·FK set null）+ 复合索引 `(organizationId,workspaceId)`（`0005` 纯additive·人已审·事务内逐条 apply·采①可空）；`TenantMiddleware` 读 `x-workspace-id`→ALS `workspaceId`（可选选择器）；`TenantContextService` 加 `workspaceId` getter；**post 仓储唯一卡点升级为复合作用域**（有 ws 即 `AND workspaceId`·跨租泄漏结构不可能）+ port `PostRecord` 加 `workspaceId`；互不可见越界回归单测 +5（list/findById 复合谓词·外部 ws 天然 0 行·create 盖 ws）。workspace CRUD 参考切片（谁可建→租户级权限·待裁）/全局 APP_GUARD/NOT NULL 收紧/全栈 e2e 留待。回灌 §10 S3 ✅ |
| 2026-10-13 | 0.9.1 | **S3 补完（workspace CRUD 参考切片·权限分层）** | 经人裁口径（`workspace:read`=全成员·`create/update/delete`=owner+admin）：扩 BA `ac` 增 `workspace` 资源（`createAccessControl` 声明全量词表）+ `roles` 精确镜像 BA 默认集再叠加 workspace（因 organization() `{...defaultRoles,...opts.roles}` 整组替换·否则 owner/admin 会丢 org 权限）·`auth.implement` 接 `organization({ac,roles})`；新建 `src/modules/workspaces` CQRS 切片（port 不暴露 tenant·Drizzle adapter 以 `organizationId` 为唯一隔离卡点·update/remove 复合作用域外租户 0 行）+ controller 逐路由 `@UseGuards`+`@RequirePermissions` + i18n name/slug；ac 角色矩阵单测 + 隔离红线单测（共 +10 测·CI 119）。全局 APP_GUARD/NOT NULL 收紧/全栈 e2e 留待。回灌 §10 S3（CRUD 已补） |
| 2026-10-13 | 0.10.0 | **S4 落地（审批制租户生命周期）** | 人裁②（封端点+自建申请端点）+审批端点入 S4：`auth.implement` `organization({allowUserToCreateOrganization:false})` 封死 HTTP 自助开通（FR-1）、透传 `createOrganization` 服务端系统动作作唯一建租户通道；新建 `src/tenancy/lifecycle`（`tenant-lifecycle` 状态机纯函数存 `organization.metadata`·**无迁移** + `TenantStatusService` 读写卡点）与 `PlatformOperatorGuard`（过渡判据 `user.role===ADMIN`）；`TenantMiddleware` 加 deny-list 失能（pending 不绑 tenantId·存量无状态放行）；新建 `src/modules/tenants` CQRS 参考切片（申请/审批/驳回 + provisioning gateway port/adapter + controller 逐路由守 SessionGuard/PlatformOperatorGuard）；Owner 保底经 BA creator=owner（FR-12 最小面）。单测 +25（CI 30 files/144）。全栈 e2e/Owner 转移随 S5。回灌 §10 S4 ✅ |
| 2026-10-13 | 0.11.0 | **S5 落地（平台经营者治理）** | 人裁 env 唯一 operator·结构化日志·§10 全套：`PlatformOperatorGuard` 从过渡 `role=ADMIN` **收敛为「会话用户 DB email 命中 `platform.operatorEmail`」**（fail-closed·401/403）·config 新增 `platform.operatorEmail`（default+interface+getter+.env.example）·seed 改为幂等 upsert 该 email（FR-13 全局唯一·不由他人任命）；状态机收紧 `canTransition` 迁移表 + `TenantStatusService.transition` 严格返回 ok/not-found/illegal（合并写回 metadata）；新建 `src/modules/tenants` 治理切片（跨租户列表/详情/诊断读侧 + suspend/resume/delete 写侧 CQRS·port 不注入租户上下文·controller 逐路由挂 PlatformOperatorGuard 不挂 TenantScope·FR-11①）；`PlatformAuditService` 结构化审计单点（pino 机读·不落新表→无迁移·approve/reject/suspend/resume/delete 成败均经此）；reject 收紧仅 pending 可驳（→409）·delete 采软删（deleted 终态·NFR-6）。**无 schema 改动→不触 migrate（高危#1）·未动全局 APP_GUARD（高危#4）**。单测 +27（CI 34 files/171）。修正冲突内存 d3bd3f95（经营者不由他人任命/break-glass 改为开发者改配置）。回灌 §10 S5 ✅ |
| 2026-10-13 | 0.12.1 | **迁移口径定档 + dev 库漂移修复（非设计变更）** | 人裁③重建空库走 migrate：本 dev 库原由 push 建立→库内 `__drizzle_migrations` 空、`consent`（自 0001）缺失与 schema 漂移（早于 S6·非回归）。采“清 public schema → `drizzle:migrate`（0000→0006）→ `db:seed`”重建为 journal 一致态（现 7 行·11 表齐·consent/user_status 往返通过）。口径写入 [`install&run.md`](../install&run.md)（文件链=SSOT·空库/CI/生产 migrate·本地增量 generate→migrate·push/reset 不填 journal）+ §11 新增迁移口径指针。无代码变更。回灌 §11、README v0.12.1 |
| 2026-10-14 | 0.13.0 | **S7 落地（订阅 / 配额挂钩·占位）** | 人裁①1:N 订阅历史·②缺订阅回落默认免费档带限额（非 fail-open）·③seats=`COUNT(member)`·④A 全套含 migrate·超限拒绝=基础设施+单测坐实·FR-8=provisioning 实调 `createCustomer`：新表 `tenant_subscription`（`0007` 纯 additive·14 列·`tenantId`→org FK cascade·`(tenantId,status)`+`(tenantId,periodStart)` 复合索引·1:N 历史·人已审 `drizzle:migrate` apply·本 dev 库走 v0.12.1 口径无 push 权宜）；`src/tenancy/quota`：`tenant-plans` 档位目录 + `QuotaService` 读写单点（`currentSubscription`/`effectiveSeatsLimit`/`currentSeats`/`checkSeats`/`assertSeats` 超限 **402 PAYMENT_REQUIRED**·Nest 无 `PaymentRequiredException` 故 `HttpException`+status·`snapshot`）；`@Quota` 装饰器 + `QuotaGuard`（opt-in 逐路由·读 ALS·无即 403·**不挂全局 APP_GUARD**·高危#4）；`src/modules/subscriptions` CQRS 切片（port 不暴露 tenant·adapter `requireTenantId()` 单点·`create` 实调 `PaymentService.createCustomer` 落 `providerCustomerId`·PaymentModule 设 `@Global` 避双实例）。**成员增建全走 BA org 路由→无可控 Nest 写路由挂 QuotaGuard→超限拒绝以基础设施+单测坐实·BA member-add 生产挂点标接线点（留后续切片）**。真库往返抓到并修 repo bug（`updatedAt` NOT NULL 无 default·`$onUpdate` 仅 UPDATE→INSERT 须显式盖章·对齐 `UserStatusService`）。附带配置卫生：`.gitignore` 加 `.qoder/`、`biome.json` includes 排除 `!.qoder`（IDE wiki 缓存不再污染 CI/git）。单测 +25（CI 42 files/216·0 边界违规）。回灌 §10 S7 ✅、§11、README v0.13.0 |
| 2026-10-14 | 0.14.0 | **S8 落地（三层权限收口·FR-11）** | 人裁 B 务实收口（不新增 PermissionScope 抽象守卫·不接全局 APP_GUARD·高危#4 继挂账）+ 单认证解析面：据实盘点三层已高度收敛（用户级 `SessionGuard`·租户级 `TenantScopeGuard`+`TenantPermissionGuard`→BA `hasPermission` 单源·平台级 `PlatformOperatorGuard`→email 单点·暂停统一经 `isBlocked`），全仓 grep 坐实**无散点内联权限硬判**（无 `role==='ADMIN'`·`user.role` 仅在聚合/映射/仓储·`hasPermission(`/`operatorEmail` 均在单点）。交付：① `src/modules/auth/session-resolver.ts` `resolveRequestSession`（`WeakMap` 按请求记忆会话·`TenantMiddleware`/`SessionGuard`/`PlatformOperatorGuard` 三处复用→每请求一次 `getSession`·原三重·仅转发不裁决·各调用方保留 401/403/DB-email 语义行为不变）；② `src/tenancy/three-layer-permission.matrix.test.ts` 互不授予/fail-closed/校验顺序矩阵（真实守卫类+ALS 真路径·+10 测）。新增 §9.6 收口说明。**无 schema 变更→不触 migrate（高危#1）**。CI 43 files/226·0 边界违规。回灌 §10 S8 ✅、§9.6、README v0.14.0 |
| 2026-10-14 | 0.15.0 | **S9 落地（DI/上下文集成测试·拓出真 prod bug）** | 新建 `src/tenancy/di-context.integration.test.ts`：首次将整条鉴权栈（`TenantScopeGuard`/`TenantPermissionGuard`/`PlatformOperatorGuard`/`SessionGuard`/`TenantMiddleware`）放进真实 `Test.createTestingModule`。**拓出已编译入产的真实 bug**：`TenantScopeGuard`/`TenantPermissionGuard` 构造参用 `import type`且无 `@Inject` token → swc `decoratorMetadata` 发出 `design:paramtypes=[Object]`（`dist/tenancy/tenant-scope.guard.js` 坐实 `typeof TenantContextService === "undefined" ? Object` 且无对应值导入）→Nest 无法实例化守卫·所有 `@UseGuards` 路由启动即崩（历片均手工 `new Guard` 单测 + CI 无真 boot 故未暴露）。修复=改显式 `@Inject(ClassToken)`+值导入（对齐 `PlatformOperatorGuard`·防 biome `useImportType` 回吸）。回归测锁三层：①design:paramtypes 携真实类②DI 容器无手工 new 解析③ALS 端到端（真中间件→守卫·无cookie/暂停租户 fail-closed 403）。**无语义变更·不触 migrate（高危#1）·未接全局 APP_GUARD（高危#4）**。CI 44 files/232·0 边界违规。回灌 §10 S9 ✅、README v0.15.0 |
| 2026-10-14 | 0.16.0 | **全栈 e2e 收口（S9 补遗·收 S2–S6 「全栈 e2e」挂账）** | 经人裁采**分层**方案（boot 冒烟进 CI + env-gated 真 HTTP e2e）：① `src/app-boot.smoke.test.ts`（DB-free·`overrideProvider(DrizzleService)`·`compile()` 整 AppModule DI 图不触发 `onModuleInit` 故免连库·**入默认 CI**）——**顺带拓出两个真 prod boot bug**：`ConfigModule` 原非 `@Global`（自定义 `ConfigService` 未全局可用→`PlatformOperatorGuard` 真 boot 注不到·修=加 `@Global()`）与 `QuotaGuard`（S7 遗留三参 `import type`+无 token→`design:paramtypes=[Object]`·同 S9 bug 类·修=值导入+`@Inject` tokens）。② `src/tenancy/tenant-isolation.e2e.test.ts`（**env-gated**·仅 `E2E_DATABASE_URL` 存时运行·真守卫/中间件/CQRS/仓储/Fastify·只在 `AuthInstanceInjectKey.getSession` 边界打桩·真 HTTP 打穿 `/posts` 断言跨租户互不可见·默认 CI `describe.skip`）。`vitest.config` `DATABASE_URL` 改为 `process.env.DATABASE_URL ?? test-db` 使 gated e2e 可指向已 migrate dev 库。**无 schema 变更不触 migrate（高危#1）·未接全局 APP_GUARD（高危#4）**。boot 冒烟 1/1·gated e2e 真库 3/3·CI 全绿 46 files/236（3 gated skip）。回灌 §10 S9+ ✅、README v0.16.0 |
| 2026-10-14 | 0.17.0 | **S10 边界细化（仅盘不动码）** | 经人裁「边界先行·仅抽 core」口径，将 §9.5 由一句草案细化为可审边界盘点（**本轮只设方案·不改代码·不触构建链**）：① 现状装配实测（单包无 workspaces·`@core/*` 别名预留但指不存在目录·TenancyModule @Global 被 53 文件 import·schema 单文件混装 core 表与参考样例表）；② core 候选清单（shared-kernel + tenancy 全套 + BA org 集成能力部分）；③ **关键张力——core 不自给自足**：三处硬耦合热点（DB/schema 具体表直 import · Auth 会话 `AuthInstanceInjectKey`/`resolveRequestSession` · `ConfigService`）；④ 四项开放待裁（§9.5.4·归人）：schema/DrizzleService 归属（推荐 C 折中：core 携 schema-core.ts+端口）· 物理 vs 逻辑边界（推荐先 P0 逻辑边界·0 构建改动）· 包名/发布形态 · workspace/subscription 领域切片归属；⑤ 目标依赖方向（reference→core→peer·core 禁反向 import 样例）；⑥ P0/P1/P2 分阶段预案 + 风险登记（P2 触构建链·全局 blast radius 最大·须人放行）。**建议止步 P0（或至多 P1）为本片交付**。S10 仍**未开工**。回灌 §9.5/§8-7/§10 S10 行、README v0.17.0 |
| 2026-10-14 | 0.17.1 | **全栈 e2e 增补跨租越界负向（接全栈 e2e 收口）** | 不选 S10 开工·改优先加固 FR-5 行级隔离红线（功能价值高·blast radius 小·无需先裁 §9.5.4 四项归人决定·不碰高危#1/#4）。在 `src/tenancy/tenant-isolation.e2e.test.ts`（env-gated）+2 负向测：① **越界写**——org_a 伪造 body `organizationId`=ORG_B 创建→控制器只读 title/content/published、`DrizzlePostRepository.create` 组 织 `organizationId` 恒取 `requireTenantId()` 可信 ctx，断言 201 且 org_a 可见自己写的、**org_b 绝不可见**（跨租写重定向失效）；② **越界读**——org_a 伪造 `x-workspace-id` 选择器→list 复合谓词 (ORG_A ∧ ws=foreign) 恒 0 行、不含 ALPHA（证明外部选择器至多匹配 0 行无法跨租）。gated e2e 真库 5/5·默认 CI 仍 `describe.skip`（DB-free 不变量不破·CI 233 passed/5 skipped）。**无代码/schema 变更·不触 migrate·未接全局 APP_GUARD**。回灌 §10 S9+ 行、README v0.17.1 |
| 2026-10-13 | 0.12.0 | **S6 落地（fail-closed 平台用户暂停）** | 人裁③独立表·①删 session+守卫纵深·A 全套含 migrate：新独立表 `user_status`（`0006` 纯 additive·PK=userId·FK→user cascade·不动 Better Auth 的 `user` 表）·`UserStatusService` 读写唯一卡点（复用 §9.4 `canTransition`·deny-list 缺行视同 active）；三层失能统一经 `isBlocked`（FR-11·禁散点）：`TenantMiddleware` 暂停用户不绑 tenant/identity、`SessionGuard` 403、`PlatformOperatorGuard` operator 自身亦校验；用户治理切片 suspend/resume（suspend 硬删该用户全部 `session` 行·D4/§159·BA revokeSessions 仅作用当前会话故直 Drizzle 删）+ 跨平台用户列表 port/adapter/query + `PlatformUsersController`（逐路由 PlatformOperatorGuard）+ `PlatformAuditService.logUserGovernance`。**租户侧失能已由 S5 deny-list 覆盖·不超范围删 session**。本库 journal 空（历片均 push 管理）→migrate 从零会撞已存表·改真库 push 口径直执 0006·往返验证 upsert/join/FK 通过。单测 +20（CI 37 files/191·0 边界违规）·未动全局 APP_GUARD（高危#4）。**新发现漂移**：`consent` 表实库本缺（早于 S6·非回归）·已列报待裁。回灌 §10 S6 ✅ |

---

<!-- 变更戳 -->
正文已于 2026-10-14 / v0.17.1 变更（**全栈 e2e 增补跨租越界负向（接 v0.16.0 全栈 e2e 收口）**：经用户「你定」选择优先加固 FR-5 行级隔离红线而非 S10 开工——在 `src/tenancy/tenant-isolation.e2e.test.ts`（env-gated）+2 负向测：① 越界写（org_a 伪造 body organizationId=ORG_B 创建→仓储 `requireTenantId()` 强制盖可信租户、org_a 自见而 org_b 绝不可见）；② 越界读（org_a 伪造 x-workspace-id 选择器→复合谓词 (ORG_A∧ws=foreign) 恒 0 行不含 ALPHA）；把跨租红线抬到真实 HTTP 边界（真库 5/5·默认 CI 仍 describe.skip·DB-free 不变量不破·CI 233 passed/5 skipped）；**无代码/schema 变更不触 migrate·未接全局 APP_GUARD（高危#4）·无需先裁 §9.5.4 归人项**；承前 v0.17.0 **S10 边界细化（仅盘不动码）**：经人裁「边界先行·仅抽 core」口径，将 §9.5 由一句草案细化为可审边界盘点——现状装配实测（单包无 workspaces·`@core/*` 别名预留但指不存在目录·TenancyModule @Global 被 53 文件 import·schema 单文件混装 core/参考表）+ core 候选（shared-kernel+tenancy+BA org 集成能力）+ **关键张力：core 不自给自足**（三处硬耦合热点：DB/schema 具体表直 import·Auth 会话 `AuthInstanceInjectKey`/`resolveRequestSession`·`ConfigService`）+ 四项开放待裁（§9.5.4·归人：schema/DrizzleService 归属推荐 C 折中·物理 vs 逻辑边界推荐先 P0·包名/发布·workspace/subscription 归属）+ 目标依赖方向（reference→core→peer·core 禁反向 import 样例）+ P0/P1/P2 分阶段预案与风险登记（P2 触构建链·blast radius 最大·须人放行）；**建议止步 P0（或至多 P1）为本片交付**·S10 仍未开工·本轮只盘边界不改代码不触 migrate·承前 v0.16.0 **全栈 e2e 收口（S9 补遗·收 S2–S6 「全栈 e2e」挂账）**：经人裁采分层方案——第一层 `src/app-boot.smoke.test.ts`（DB-free·`Test.createTestingModule({imports:[AppModule]}).overrideProvider(DrizzleService)`·`compile()` 整树 DI·`compile` 不触发 `onModuleInit` 故免连库·**入默认 CI**）**顺带拓出两个真 prod boot bug**：`ConfigModule` 原非 `@Global`（自定义 `ConfigService` 未全局可用→`PlatformOperatorGuard` 真 boot 注不到·修=加 `@Global()`）与 `QuotaGuard`（S7 遗留三参 `import type`+无 `@Inject` token→`design:paramtypes=[Object]`→Nest 无法实例化·同 S9 bug 类·修=值导入+`@Inject` tokens）；第二层 `src/tenancy/tenant-isolation.e2e.test.ts`（env-gated·仅 `E2E_DATABASE_URL` 存时运行·真守卫/中间件/CQRS/仓储/Fastify·只在 `AuthInstanceInjectKey.getSession` 边界打桩·真 HTTP `app.inject` 打穿 `/posts` 断言跨租户互不可见·默认 CI `describe.skip` 不破 DB-free 不变量）；`vitest.config` `DATABASE_URL` 改外部可覆盖以支持 gated e2e 指真 dev 库。boot 冒烟 1/1·gated e2e 真库 3/3·CI 全绿 46 files/236（3 gated skip）·无 schema 变更不触 migrate·未接全局 APP_GUARD（高危#4）·真实 Better Auth 登录编排仍留「全栈 CI 拼 PG」专项；承前 v0.15.0 **S9 DI/上下文集成测试（NFR-7）**：新建 `src/tenancy/di-context.integration.test.ts` 首次把整条鉴权栈（TenantScope/TenantPermission/PlatformOperator/SessionGuard + TenantMiddleware）放进真实 `Test.createTestingModule`·**拓出已编译入产的真实 bug**——`TenantScopeGuard`/`TenantPermissionGuard` 构造参 `import type`+无 `@Inject` token→swc `decoratorMetadata` 发 `design:paramtypes=[Object]`（dist 坐实）→Nest 无法实例化守卫·所有 `@UseGuards` 路由启动即崩（历片手工 `new`+CI 无真 boot 未暴露）；修复=改显式 `@Inject(ClassToken)`+值导入·防 biome `useImportType` 回吸；回归测锁 design:paramtypes/DI 解析/ALS 端到端三层·CI 44 files/232·0 边界违规·无语义变更不触 migrate·未接全局 APP_GUARD；承前 v0.14.0 **S8 三层权限收口（FR-11）**：人裁 B 务实收口 + 单认证解析面——`src/modules/auth/session-resolver.ts` `resolveRequestSession` 按请求记忆会话（`TenantMiddleware`/`SessionGuard`/`PlatformOperatorGuard` 三处复用·每请求一次 getSession·仅转发不裁决行为不变）+ `three-layer-permission.matrix.test.ts` 互不授予/fail-closed/校验顺序矩阵（真实守卫类+ALS 真路径·+10 测）·全仓 grep 坐实无散点内联权限硬判·不新增 PermissionScope 守卫·不接全局 APP_GUARD（高危#4 继挂账）·无 schema 变更不触 migrate·CI 43 files/226；承前 v0.13.0 **S7 落地（订阅/配额挂钩·占位）**：人裁①1:N 订阅历史·②缺订阅回落默认免费档带限额·③seats=`COUNT(member)`·④A 全套含 migrate·超限拒绝=基础设施+单测坐实·FR-8=实调 `createCustomer`——新表 `tenant_subscription`（`0007` 纯 additive·14 列·FK cascade·2 复合索引·1:N 历史·人已审 `drizzle:migrate` apply）+ `src/tenancy/quota`（`tenant-plans` 目录 + `QuotaService` 读写单点·`assertSeats` 超限 **402**·缺订阅回落 FREE_PLAN）+ `@Quota`/`QuotaGuard`（opt-in 逐路由·不挂全局 APP_GUARD·高危#4）+ `src/modules/subscriptions` CQRS 切片（adapter `requireTenantId()` 单点·`create` 实调 `PaymentService.createCustomer` 落 `providerCustomerId`·PaymentModule `@Global`）；成员增建全走 BA org 路由→无可控 Nest 写路由挂 QuotaGuard→超限拒绝以基础设施+单测坐实·BA member-add 生产挂点标接线点（留后续切片）；真库往返 INSERT/1:N/免费档回落/FK cascade 通过·**抓到并修 repo bug**（`updatedAt` NOT NULL 无 default·INSERT 须显式盖章）；附带配置卫生 `.gitignore`+`.qoder/`·`biome.json` `!.qoder`。单测 +25·CI 42 files/216·0 边界违规；全局 APP_GUARD/NOT NULL/全栈 e2e 仍挂账；承前 v0.12.1 **迁移口径定档 + dev 库重建走 migrate**（文件链=SSOT·现 journal 8 行 0000→0007·12 表齐）；承前 v0.12.0 **S6 落地**：新独立表 `user_status`（0006）+ `UserStatusService` 读写卡点·三层失能统一经 `isBlocked`·suspend 硬删 session 行·`PlatformUsersController`+`logUserGovernance`），以当前正文内容为准。
