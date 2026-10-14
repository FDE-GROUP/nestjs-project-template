# 技术方案 · S7 收尾：BA 成员增量配额挂钩接线（附 §10 挂账清欠）

> 状态: **已验收·结项**（人确认 2026-10-14·commit `063c4dc`+`3d7ec54`）| 读者: **Agent**（开发依据）
> blast radius: **module**（auth 装配 + tenancy/quota）+ 附片触 **高危#2 删码**（逐文件列明·须人单独签核）与 **#5 vision 收口**
> 关联: [global-tenancy](./global-tenancy.md) §10 S7 行（*"BA member-add 生产挂点标接线点·留后续切片"*）· vision §7 阶段 2 收尾

## 1. 背景与 spike 结论（实测 2026-10-14）

- S7 已交付 seats 计量（`QuotaService.assertSeats` 超限 402·seats=`COUNT(member)`），但**成员增建全走 Better Auth org 路由**，Nest 侧无可控写路由挂 `QuotaGuard` → 超限拒绝仅基础设施+单测坐实，**商业闭环（vision 阶段 2）实际未合龙**：付费上限在生产路径上不被强制。
- **BA 钩子面 spike**（读 `better-auth@1.7.7` dist 编译产物）：
  - `api/dispatch.mjs` 存在完整 **`options.hooks.before/after`** 机制：`matcher(context)` 为**函数**（可对 `context.path` 做正则判定），before handler 内 `throw APIError(...)` 即拦截、亦可改 context——官方支持的扩展点，非私有 hack；
  - organization 插件 endpoints 含 `addMember` / `updateMemberRole` / `removeMember`（`crud-members.mjs`）与邀请链 `acceptInvitation`（接受邀请同样落 member 行·seats 计数面）；
  - **确切 HTTP path 字面量**（kebab vs camel）编译产物不可判——实现第一步以 hook 日志/gated e2e **实证锁定**，matcher 初版用双拼写宽松正则，实证后收紧留测（不臆测）。

## 2. 目标 / 非目标

**目标**：成员增量端点（addMember + acceptInvitation）经 BA before-hook 走 `QuotaService.assertSeats`，超限 **402** 拒绝，生产闭环合龙；附片清 §10 挂账。
**非目标**：账单周期滚动/续费（P3/D9 暂缓不动）；不引 DB 触发器/不走反向代理路由（hook 为正解）；`updateMemberRole` 不增 seats 不拦；removeMember 不拦。

## 3. 设计

### 3.1 主片 · 配额 hook 接线

- `auth.implement.ts` 的 `betterAuth({...})` config 增 `hooks.before`：matcher 命中成员增量端点 → handler 解析目标 org（`ctx.body.organizationId ∪ 会话 activeOrganizationId`）→ 经 Nest `QuotaService.assertSeats(orgId, {take: 1})` 前置校验 → 超限抛 402（复用 S7 语义与错误体）。
- 依赖注入形态：BA 实例创建于 Nest provider 内，hook 闭包直接捕获 `QuotaService`（构造期注入·无需新端口）；**S9 铁律**：相关导入值导入。
- 测试：① hook 单测（QuotaService mock·matcher 命中/不命中·402 透传）；② gated e2e +1——真 BA 编排建 org→塞满 seats→第 N+1 个 addMember 断 402（真库·env-gated）；③ path 实证断言（hook 首跑 log 确认后 matcher 收紧为实测字面量）。

### 3.2 附片 · §10 挂账清欠（高危#2·逐文件签核）

- 删 `StorageService.uploadFile`（v0.18.12 人工核验登记：全仓无调用方·执行前再 grep 复核一次）；
- 删 `TenantStatus`/`PlatformUserRow` 冗余 re-export（同登记·grep 复核消费面）;
- `reflect-metadata` test-only 观察项：核验是否仅测试链引用——**只定性登记，不轻动依赖**（若 prod build 依赖图含之则保留）；
- vision §8-5「首期范围」收口：实际已按 S0–S11→ES→就绪路径回答，标注「已裁决·即 §7 阶段推进本身」并引本节（高危#5 措辞·diff 随本 plan 呈签）。

## 4. 风险与回滚

- **高危#2 命中**（删码）：三笔处置逐条列明依据，人单独签核后方可删；主片与附片**分 commit**，回滚互不拖累。
- matcher 误伤面：宽松期仅拦成员增量端点（宁漏勿误·漏拦有单测倒逼收紧）；hook 内异常若不属 402 一律冒泡 500（fail-loud·不静默放行超限）。
- 非事务窗口如实登记：hook 校验与实际插入间存在并发窄口（两个请求同时过校验可超 1 seat）——quota 语义为**软性商业限制**非资金硬约束，与 S7 现状一致，不为此引锁（登记不掩盖）。

## 5. 完成判据（DoD）

- [x] path 实证 + matcher 收紧留测；addMember/acceptInvitation 超限 402（单测 + gated e2e 真库绿）——实测：hook 在真库 e2e 命中 `/organization/accept-invitation`，第 6 人 accept 拒 `Seat quota exceeded: 5+1 > 5`
- [x] 未超限路径零回归（gated e2e 原 5 测 + 新断言全过·默认 CI 语义不变）——前 5 席 accept 全 2xx；默认 CI 283/11 全绿
- [x] 附片三笔挂账处置完成并留痕（见 §6 v0.3 事实订正：①删 ②已于 ES 切片删过、本轮无需动作 ③只定性登记）
- [x] CI 全绿（基线 276/10 → **283/11**）·0 边界违规；S7 行/§10/vision 回灌；分 commit 提交 + push

## 6. 审计记录

**开放未决（附建议·待人裁）**：
- 甲 · 邀请接受（acceptInvitation）是否同拦：**建议是**（seats=member 行数口径下邀请是平行入组通道，不拦即绕行）；
- 乙 · 三笔挂账处置是否全批（高危#2）：**建议批前两笔删除**，reflect-metadata 仅定性登记；
- 丙 · 并发窄口接受软性语义（§4）：**建议是**（硬约束需锁/串行化，与商业配额定位不匹配）。

- 2026-10-14 v0.1: 初稿（待审计·spike 见 §1）。
- 2026-10-14 v0.2: 人「同意」过门（甲乙丙照建议）。实现前二轮 spike 事实修正（不臆测条款兑现）：**`addMember` 在 BA 1.7.7 为 server-only、不注册 HTTP 路由**（编译产物注释明笔），teams 缺省未启用，项目内零服务端 addMember 调用——真实 HTTP 入组通道 = `invite-member`（仅发邀请·不写 member 行）→ **`accept-invitation`（member 行落行时点·唯一卡点）**；建租 creator 走平台审批 server 通道（S4/S5）不拦。另 accept-invitation 请求体仅 `{invitationId}`，目标 org 需查 invitation 表（读侧·守表所有权纪律条款②）。
- 2026-10-14 v0.3: 实现期三项如实登记：① **hook 形态修正**——首轮按顶层 `options.hooks.before` 写，dispatch.mjs 运行时实读发现顶层形态是**单函数**，`{matcher,handler}[]` 只存在于插件级 hooks（对齐同文件 `add-account-to-session` 先例）→ 改自定义插件 `seats-quota-guard`；② **e2e 驱动形态**——harness 不复现前缀/版本化装配（BA HTTP 端点无匹配 Nest 路由→inject 404·老注释同因实证），改用 S9 补遗同款服务端透传（dispatch 注释明笔 auth.api.* 与 router 走同一 hooks pipeline·证效等价；server key 为 `createInvitation` 非 invite-member path 名）；实测服务端通道超限以 APIError 冒泡（asResponse 不拦）而生产 HTTP 面转 402 响应，两态都接同口径断言；③ **附片②挂账陈旧**——`TenantStatus`/`PlatformUserRow` read-model re-export 已于 ES 第二切片删过（global-tenancy §10 v0.18.12 处置记录 L241），挂账未清导致重报；本轮核验零命中即无需动作，回灌销账。① uploadFile 删除系**新签覆盖旧裁**（ES 切片 §6-② 曾裁保留担心断链）：本轮人签后删 service 门面，链路核验全仓无编译断裂（CI build 绿），副作用：provider 接口 `uploadFile` 方法+3 实现失去仓内唯一消费者→**provider 面作为对外扩展点保留·登记观察项**（下游 fork 若需 Buffer 直传可重建门面）；另顺手订正 auth.implement `appName` 兑底古董名 `nestjs-project-template`（仓库更名漏改面）。
- 2026-10-14 v0.4: 验收——主片 hook+单测 7+gated e2e 真库绿（path 实证由测试本体完成）；附片三笔落定；CI 新基线 **283/11**·0 边界违规。
- 2026-10-14 v0.5: 人「继续」验收·**结项**。commit `063c4dc`（主片）+ `3d7ec54`（附片）已推 origin/main（pre-push CI PASSED）。产物记忆：S7 接线决策升格为「BA hook 商业闭环」永久档；后续候选剩：租户级数据导出（待 vision 阶段 3 宣示）、microservice-readiness 后续项（均裁缓至触发）。
