# Better Auth `organization` 插件承载多租户 membership/RBAC · 可行性调研

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）
> 关联: [global-tenancy.md](../plans/global-tenancy.md) D1–D6 / FR-1~13 / §8-2 · [global-cn-adaptation.md](../plans/global-cn-adaptation.md) FR-3/§8-3 · [better-auth-cn-providers.md](./better-auth-cn-providers.md) 风险1（境内无 email）· [vision.md](../specs/vision.md) §4.1 / §8
> 日期: 2026-10-13 | 证据基线: Better Auth v1.7.x（本仓 `better-auth ^1.7.7`）官方文档 `plugins/organization`
> 本文只作制定 plan 的**参考**，结论须经人二次核验后方可写入方案（`workflow.md` §3）
> 受众: **Agent 可参考（非依据）· 人主导判读**

---

## 0. 调研目的

回答 [global-tenancy](../plans/global-tenancy.md) **§8-2**：Better Auth 的 `organization`（含可选 `teams`）插件**能否直接承载** membership（D3/FR-3）与租户内 RBAC（FR-4），从而**减少自建**？据此钉死多租户「复用 vs 自建 vs 混合」的地基选型，作为起草技术方案前的输入。**本文不裁决、不写码**，只给覆盖度判读与待人二判的风险清单。

## 1. 结论速览

**倾向「混合复用（hybrid-reuse）」**——`organization` 插件**精准命中最易造错的基础设施**（tenant 实体 + user×tenant membership + 受邀 + 租户内 RBAC），建议复用；但它**不碰**数据隔离强制、workspace 强边界、审批制生命周期、订阅配额、三层权限的另两层、fail-closed 暂停、Owner 治理——这些仍须业务侧自建。把 org 的 **active organization** 作为**受信 `tenant_id` 单一来源**喂给自建守卫。

**org 插件原生提供**（据官方文档）：`organization` / `member`(`userId`,`role`,`organizationId`) / `invitation` 三表；`session` 增 **active organization id**（+ team id）字段；`ac` 访问控制 + `roles`(`owner`/`admin`/`member`/自定义) + `hasPermission({resource:[actions]})`；`allowUserToCreateOrganization` 钩子；member/org 的 before/after 钩子；可选 `organizationRole`（动态角色）与 `team`/`teamMember`。

| 需求 | org 覆盖 | 缺口（须自建） |
|------|---------|----------------|
| D1 行级 `tenant_id` | 提供 `organization` 实体 + `member.organizationId` 作 tenant 来源 | **不给业务表加 `tenant_id`、不自动 scope 查询** → FR-5 守卫自建 |
| D2 两级 tenant→workspace | `organization`=顶层 tenant；`team` 近似二级分组 | workspace「`(tenant_id,workspace_id)` 复合强边界」**非 team 语义**，须自建或谨慎复用 |
| D3 membership 多对多 + (user,tenant) 角色 | **直接命中** `member` 表 | — |
| D4 JWT claim 主 + header 覆盖 | 走 **session.activeOrganizationId**（含 `setActive`/切换能力） | 本仓为 **JWT**：须把 active org 映射进 **JWT claim**，接缝待核验 |
| FR-1 审批制创建租户 | `allowUserToCreateOrganization` 可 gate | **无内建「待审批」状态**：申请→平台人工认证→生效工作流自建 |
| FR-3 申请 + 受邀并存 | 受邀 = `invitation`（内建 pending/accept，按 email） | **「申请加入」方向无内建 join-request**；受邀 email 未注册须先注册（联动 cn-providers 风险1） |
| FR-4 租户内 RBAC | **直接命中** `member.role` + `ac`/`hasPermission`，天然限本租户 | 「校验统一在切片、禁散点」须在守卫层封装；`ac` 粒度是否满足「角色/权限点分离」须核 |
| FR-5 数据隔离强制 | 提供 tenant 来源 | **核心缺口**：不自动加谓词、无「漏挂即红」守卫 → 自建 |
| FR-8/D5 计费 · 订阅配额 | `organization.metadata` 可存指针 | 订阅 / 配额模型（挂 tenant）**完全自建** |
| FR-10/FR-11 三层权限 fail-closed | 只给「租户级」一层 | 平台级（FR-13 唯一经营者）+ 用户级两层 + 暂停态裁决自建 |
| FR-12 Owner 规则 | 有 `owner` 角色 | 「至少留一名 / 移交 / 经营者接管」业务规则自建 |
| FR-13 平台经营者全局唯一 | per-tenant 概念，无「平台级 operator」 | 完全自建（现 `user.role=ADMIN` 可演化为平台级） |

> 净判读：**复用可省掉「成员表 / 角色分配 / 邀请流」三块重复造轮子**（多租户里最易出安全 bug 的部分）；**但框架的隔离守卫、workspace 边界、审批 / 计费 / 三层权限**仍是本项目的主体自建工作量。

## 2. 能力依据（引 Better Auth 文档）

来源: <https://www.better-auth.com/docs/plugins/organization>（访问 2026-10-13）

- 「The organization plugin allows you to manage your organization's **members and teams**… Assign **roles and permissions**」——org/member/invitation 三表 + RBAC 为一等公民。
- Schema 章：插件加 `organization`/`member`/`invitation` 表；**`session` 需加两字段存 active organization / team id**（→ D4 session 模式锚点）。
- Access Control：`organization({ ac, roles: { owner, admin, member, myCustomRole } })` + `auth.api.hasPermission({ body:{ permissions:{ project:["create"] } }})`——(user,org) 维度的 resource:action 授权。
- 创建门槛：`allowUserToCreateOrganization: async (user) => { const subscription = await getSubscription(user.id); ... }`——可按订阅 gate 建 org（对上 FR-1 审批的**准入校验点**，但审批流本身仍自建）。
- Member/Org 钩子：`beforeAddMember` / `afterCreateOrganization` 等——可挂钩生命周期裁决（如暂停态）。
- 可选 `organizationRole` 表（动态角色对象）与 `team`/`teamMember`（二级分组）——D2 workspace 的可复用候选。

## 3. 主要风险 / 待决（须进 plan，非本文裁决）

1. **JWT vs session activeOrganizationId 接缝**（结构级）：~~待核~~ → **已代码级核验（见 §6 spike 补记）：非阻塞、反而天然对齐**。本仓实为 cookie + 服务端 DB session（`SessionGuard` 走 `auth.api.getSession({headers})`），org 插件把 `activeOrganizationId` 存于 **session 字段**、由同一 `getSession` 带出——注入租户上下文只需读 `session.activeOrganizationId`，无需 JWT claim 管道。**副作用：与 [global-tenancy D4「JWT claim 为主」前提不符，须上报人裁（见 §6）**。
2. **手写 Drizzle schema 的集成成本**：本仓 auth 表为**手写维护**（`src/database/schema.ts` 单文件，`user` 已手加 `isOwner`/`handle` 等 Better Auth additionalFields）。org 插件要新增 `organization`/`member`/`invitation` + 改 `session`——须核验其在**手写 schema + 单一 `database/schema.ts` 布局**下的生成 / 迁移路径（文档字段清单为渲染组件、未取精确列，以实际生成表为准）。
3. **RBAC 粒度**：`member.role` 为**单字符串角色** + `ac` 的 resource:action。FR-4/FR-11「角色与权限点分离」「三层各自 fail-closed」——须核 `ac` 表达力是否足够，`organizationRole` 动态角色是否引入额外复杂度。
4. **受邀 email 依赖**：`invitation` 以 email 为锚，与 [cn-providers 风险1](./better-auth-cn-providers.md)（微信/钉钉/飞书常无 email）叠加——境内场景下受邀流可能需要 email 之外的锚点。
5. **`teams` ≠ workspace 语义**：org 的 `team` 是「组织内团队」，与 D2「workspace = 纯数据分组 + 强边界、不设独立角色层」不完全对齐；复用 `team` 反而可能带入 team 级权限（违背 CL-5 三层）。倾向 **workspace 业务侧自建、不复用 team**。
6. **与 D6 两包拆分协调**：org 表落 auth 侧还是 core 库、`tenant_id` 来源与业务守卫的依赖边界，须在方案层定（§8-7）。

## 4. 对 plan 的建议（候选，待人二判）

- **地基选型 = 混合复用**：以 `organization` 承载 **tenant 实体 + membership + 受邀 + 租户内 RBAC**；自建 **数据隔离守卫（FR-5）+ workspace 边界（D2）+ 审批制生命周期（FR-1）+ 订阅配额（D5/FR-8）+ 三层权限的平台/用户级（FR-11/FR-13）+ fail-closed 暂停（FR-10）+ Owner 治理（FR-12）**。
- 把 **org.activeOrganizationId 作为受信 `tenant_id` 单一来源**，注入 AsyncLocalStorage 请求 scope（FR-2），供自建守卫消费。
- **`team` 不复用于 workspace**（见风险5）；workspace 作业务侧二级数据分组。
- **实现前最小 spike**（同 cn-providers）：先在本仓手写 Drizzle 布局下装 `organization` 插件、跑通「建 org → member 多租户 → `hasPermission` → 切换 active org」，重点验 **JWT 接缝（风险1）**，通过后再据此起草技术方案主体并过审计门。
- 技术方案落笔时，逐条把 §1 表格的「缺口」映射到垂直切片（对齐 [global-tenancy §7 判据2](../plans/global-tenancy.md)）。

## 5. 证据与出处

- Better Auth · Organization 插件（安装 / Usage / Access Control / Hooks / Schema）：<https://www.better-auth.com/docs/plugins/organization>（访问 2026-10-13）
- 本仓证据基线：`better-auth ^1.7.7`；`src/database/schema.ts` 仅 `user`/`account`/`session`/`verification`（+ `consent`/`post`），**全仓 `src/` 无 `organization`/`tenant`/`membership`/`workspace` 任何引用**（多租户为绿地）。
- 文档 `DatabaseTable` 组件渲染的字段清单未取到精确列；**实际字段须以生成的 Drizzle 表为准**，本文不作断言。
- 关联既有调研：[better-auth-cn-providers.md](./better-auth-cn-providers.md)（境内登录渠道、email 缺失风险）。

## 6. Spike 补记（代码/类型级核验 · 2026-10-13）

针对风险①的 JWT↔activeOrganizationId 接缝，以**本仓 node_modules（`better-auth@1.7.7`）源码/类型 + 仓内 auth 实现**为真值核验（未跑 DB boot）：

- **本仓验活形态**：`src/modules/auth/guards/session.guard.ts:46` → `auth.api.getSession({ headers: req.headers })`；`auth.implement.ts` **未挂 `jwt()` 插件**，`authConfig.jwt.secret` 仅作 Better Auth 内部 session cookie 签名密钥。**结论：本仓 = cookie + 服务端 DB session，非无状态 JWT。**
- **org 插件 activeOrg 位置**：`plugins/organization/schema.d.mts` 的 `SessionDefaultFields.activeOrganizationId`（string, required:false, input:false）——**挂在 session 记录上**，由 `getSession` 一并返回。→ 与本仓 session 模型**天然对齐**，注入租户上下文 = guard 读 `result.session.activeOrganizationId` → AsyncLocalStorage，**无需 claim 改造**。
- **切换 active org**：端点 `/organization/set-active`（写 session.activeOrganizationId）存在；全套端点涵盖 `create/update/delete/list`、`set-active`/`set-active-team`、`invite-member`/`accept-invitation`/`reject-invitation`/`cancel-invitation`、`update-member-role`/`remove-member`/`leave`/`get-active-member(-role)`/`list-members`、动态角色 `create/list/update/delete-role`。
- **未验（留 plan 待 spike）**：风险②（组插件新增 `organization`/`member`/`invitation` + `session` 列在**手写单文件 Drizzle schema** 下的 `drizzle-kit generate`/migrate 具体路径）需真实 DB 才能坐实；不推翻结构结论。

> **副作用（已人裁 · 2026-10-13）**：本次核验发现 [global-tenancy D4](../plans/global-tenancy.md) 「JWT claim 为主」与**代码实态（cookie+DB session）不符**。经人裁决，**D4 已修正为「cookie + 服务端 DB session 为主」**（global-tenancy v0.3.0）：顺着实态走，租户上下文 = guard 读 `session.activeOrganizationId`、零 claim 改造，FR-10 暂停=失效 session 行。（本文仅上报事实，裁决权属人）。

---

<!-- 变更戳 -->
正文已于 2026-10-13 起草（v0.1.0），同日补 §6 代码级 spike 核验（v0.2.0）；结论须人二次核验后写入 plan，本文不作开发依据。
