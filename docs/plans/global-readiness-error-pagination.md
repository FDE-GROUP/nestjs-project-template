# 就绪预备切片：稳定业务错误码 + 游标分页契约（microservice-readiness §2.3 #3 + #5）

> 适用范围: `全局` ← 触公共契约（`shared-kernel` 错误码 / `Page` 形状 / `ErrorResponse`），blast radius = 全局，审计深度 = 人签核（`workflow.md` §3/§5·高危#4）
> 关联: [microservice-readiness](./microservice-readiness.md) §2.3-3 / §2.3-5 + §4-②（错误码冒号命名已锁）+ §4-④（游标本片性=否·立标准后另裁） · [module-common-error-response-contract](./module-common-error-response-contract.md)（`fed300b`·`errorCode` 透传机制已备） · [module-common-pagination-contract](./module-common-pagination-contract.md)（`8d85e5b`·`Page<T>` 契约·cursor/sort 按 §6-丁缓行） · [module-common-pagination-coverage](./module-common-pagination-coverage.md)（`6748f3c`·业务端点接入现状）
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

ORM 迁移主线收尾后，人择「就绪便宜预备」方向，落 microservice-readiness §2.3 缓行的两项：**#3 稳定业务错误码** 与 **#5 游标分页**。两者均为「契约增量」——非破坏优先，且各自触公共契约（高危#4），须过审计门方可实现。

**#3 现状**：`ErrorResponse` 七字段中 `errorCode?: string` 透传机制已由 `fed300b` 建好（HttpException object response 摘取·零新类），但当时明示「机制先行·码表等消费方按需定义」。全仓 **44 处业务抛错点**（tenants 19 / core 10 / storage 6 / auth 3 / users 2 / workspaces 2 / payment 1 / tenancy-infra 1）**现状全为纯字符串、零一带码**；初判 43 系「9 命名子类」正则漏计 `quota.service` raw `HttpException(…,402)` seat 超限与 `payment.service` `ServiceUnavailableException` 两枚（尤以 402 `SEAT_LIMIT_EXCEEDED` 为配额闭环最关键码），盘全订正为 44；§4-② 已锁命名 = **冒号分段**（如 `TENANCY:SEAT_LIMIT_EXCEEDED`）。repowiki 自认「无错误码」为短板。本片把已备的**机制填成码表**。

**#5 现状**：`Page<T>` = offset 语义（`items/total/limit/offset`）；列表端点走 offset 的有 5 处（治理面 platform-tenants / platform-users + 业务面 workspaces / posts / users findAll）。分页契约片 §6-丁 明示「cursor 与 sort 参数化缓行·有真实需求再设计」；readiness §4-④ 裁「游标分页本期性=否·**立标准后另裁**」——**本片即该「立标准」片**。

**目标**：两片各立可审的 expand 增量，不越 §4-④ / §6-丁 既有裁决，不提前铺未需要的机制。

**非目标**：响应壳**不**迁 RFC 7807（沿用 `fed300b` 形态甲裁）；**不**删 `Page<T>`（offset 保留为例外）；零 schema、零依赖、不动门禁/CI、不改 DI 形态；不做 outbox / ES（属 #2·另案）。

## 2. 方案

两片**相互独立**、可并行或串行，人亦可在审计门择一先做 / 拆为两行分别签核。均以 **expand（并存·非破坏）** 优先，contract（删旧 / 逐端点迁移）留按需批次。

### 2.1 切片 A · 稳定业务错误码

1. **码表单源**（`libs/core/src/shared-kernel/errors/error-codes.ts`·纯常量·框架无关·与 `pagination.ts` 同居 shared-kernel）：
   ```ts
   export const ErrorCode = {
     TENANCY_STATUS_CONFLICT: 'TENANCY:STATUS_CONFLICT',
     TENANCY_SEAT_LIMIT_EXCEEDED: 'TENANCY:SEAT_LIMIT_EXCEEDED',
     // …
   } as const;
   ```
   值 = 冒号分段（`NAMESPACE:STABLE_NAME`·§4-②）；命名空间候选集：`AUTH / TENANCY / USER / WORKSPACE / POST / STORAGE / BILLING / COMMON`。**归人裁点·甲**：命名空间粒度（按限界上下文 vs 按资源）。
2. **抛错点附码**（expand）：命中的业务失败改 object response 形态 `throw new ConflictException({ message: '…', errorCode: ErrorCode.TENANCY_STATUS_CONFLICT })`——filter 已透传，响应壳形状不变（`message` 文本原样保留·仅**附** `errorCode`）。**归人裁点·乙**：附码范围 = ①全 43 / ②**仅业务语义关键码**（状态机冲突·配额超限·权限拒绝·幂等冲突·驳回）· 通用 `NotFound('… not found')` 靠 HTTP 404 + `error` 已可辨型不强塞（**推荐②·与 `fed300b`「不为假想需求预填」同调**）/ ③仅立约定 + 校验面（最小·但则 #3 未真正补「无错误码」短板）。
3. **校验/业务共用扁平 `errors[]`**（**归人裁点·丙**·可选加法）：`ErrorResponse` 追加 `errors?: Array<{ path?: string; code?: string; message: string }>`，把 class-validator 的 `message: string[]` 结构化上移为字段级明细（RFC 9457 `errors` 思想·**不换响应壳**·顶层 `message` 保持兼容）。若裁「本片只做码·不做 errors[]」则 §2.1 缩至 (1)+(2)。

### 2.2 切片 B · 游标分页契约（立标准 + 可选 expand 示范）

1. **契约新增**（`shared-kernel/pagination.ts`·**纯 additive**）：
   ```ts
   export interface CursorPageRequest { readonly limit: number; readonly cursor?: string; }
   export interface CursorPage<T> { readonly items: T[]; readonly hasMore: boolean; readonly nextCursor?: string; }
   export function createCursorPage<T>(items, hasMore, nextCursor?): CursorPage<T> // items 浅复制·同 createPage 纪律
   ```
   `Page<T>` / `createPage` / `PageRequest` **一字不动**。
2. **入参 DTO**（`apps/api/src/common/dto/list-cursor.dto.ts`）：`ListCursorDto { limit; cursor? }`，`cursor` 为**不透明 base64url 串**（校验仅接受 base64url 字符集 + 长度上限·解析失败 → 400）。
3. **排序键与游标编码**（**归人裁点·丁**）：游标分页须**确定性全序**。推荐排序键 = **`(createdAt DESC, id DESC)` 复合**（时序稳定·`id` 兜底同刻并发）；游标 = 该复合键的不透明 base64url 编码。备选 = `id` 单调键（更简但要求列表按 id 序·语义偏离「最新在前」）。实现期核 `createdAt` 是否已有可用索引（无则登记·**不在本片加索引**·避免触高危#1）。
4. **标准成文**（`specs/tooling-standards.md` + `specs/architecture.md`）：兑现 §4-④「立标准」——书「**新列表端点宜游标（`has_more` + 不透明 cursor）· offset 为例外**」一条并归入分页纪律，作为后续逐端点 expand–contract 的准绳。
5. **示范迁移**（**归人裁点·戊**）：本阶段是否即迁一列表现证可行——① **纯立契约·不迁任何端点**（最保守·本片零破坏·迁移全留按需批）/ ② **迁 1 端点作 expand 样例**（推荐 `GET /posts`·结构简洁·有租户 scoping 代表性；⚠️ `Page<T>`→`CursorPage<T>` 是响应形状**破坏性**变更·同 coverage §3 甲裁「前端未入场=最后便宜改窗」窗口正在关）。

### 2.3 两片执行顺序

A、B 互不依赖，各自「实现 → CI 绿 → 验收」。建议 A 先行（无破坏性·纯附码 + 加法字段），B 视戊裁决定是否含端点迁移。

## 3. 影响面与风险

- **blast radius / 可逆性**：全局（公共契约），但两片皆 **expand**——A 只在已存在的可选 `errorCode` 上赋业务值 + 抛错点由 string 改 object（响应壳不变·`message` 文本保）；B 只加新契约类型 + 标准成文，唯戊=②时含单端点形状破坏（可控）。**可逆**：A 撤附码=还原 string 抛错；B 撤新类型 / 端点退回 `Page<T>` = 局部 revert。
- **高危清单命中**：触**公共契约（#4）→ 人签核**（本审计门）；**零 schema（不触 #1）**、零依赖、零门禁/CI、不改 DI 形态。errors[]（丙）与端点迁移（戊②）各自仍在 #4 口径内、不新增高危面。
- **主要风险**：① 码表膨胀 / 命名漂移 → 单源常量 + 命名空间约定 + 契约测试锁格式（禁运行时自由拼串）；② 游标排序键无稳定全序 → 强制复合 `(createdAt,id)` 唯一键；③ cursor 被误当安全边界 → 明示**不透明仅为防实现细节泄漏、非授权替代**（守卫面不变）。
- **回滚策略**：无数据面/迁移，revert 即净退；`Page<T>` 全程保留，端点可双向切。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计**（人签核 2026-10-17·经 AskUserQuestion 逐裁甲–戊·取**完整 scope**）→ 授权开工实现
- 未决项逐裁（定）：
  - **甲**：命名空间 = **按限界上下文**（`AUTH / TENANCY / USER / WORKSPACE / BILLING / STORAGE`）
  - **乙**：附码范围 = **全 44 处都附码**（含各 `NotFound→*:NOT_FOUND` 家族·非保守档）
  - **丙**：**同时引入结构化 `errors[]`**（校验/业务共用扁平·顶层 `message` 兼容不破）
  - **丁**：游标排序键 = **`(createdAt, id)` 复合·降序**（实现期核 `createdAt` 索引·无则登记不本片加）
  - **戊**：**迁 `GET /posts` 作 expand 样例**（含该端点 `Page<T>`→`CursorPage<T>` 响应形状破坏变更）
- 审计人 / 日期：人（AskUserQuestion「全 43·加 errors[]·(createdAt,id)·迁 /posts」）/ 2026-10-17
- 执行完成（留痕·v0.3.0）：切片 A 提交 `9056fbe`（码表 + 全 44 附码 + errors[]·ci 361 passed）；切片 B
  提交 `d9ea6af`（游标契约 + ListCursorDto + 迁 /posts + specs 立标准·ci 380 passed·基线只增不减）。
  游标真库 e2e 已对 `nestjs_practice` 手跑绿（无重无漏 + 同刻 id 兜底 + 畸形 400）·CI 默认 env-gated 跳过。

## 5. 完成判据（可核验 + 穷尽）

**切片 A**
- [x] `error-codes.ts` 单源常量就位；契约测试锁命名格式（值必属 `NAMESPACE:NAME` 文法·禁裸串散落）
- [x] 按乙裁范围的业务抛错点附码（实 44 处）；`fed300b` 既有 `errorCode` 透传测不回退；新增 string+options/402 兜底/errors[] 透传测
- [x] （丙=是）`errors[]` 结构化产出 + 校验面映射测（`fromValidationErrors` 递归展平）；顶层 `message` 形状兼容不破

**切片 B**
- [x] `CursorPageRequest` / `CursorPage<T>` / `createCursorPage` 契约 + 单测（浅复制纪律）；`ListCursorDto` cursor 校验测（合法/畸形）
- [x] 游标编码往返测 + 排序键全序测（首页 `hasMore=true` → 以 `nextCursor` 续取**无重无漏**·真库 e2e 实证）
- [x] `tooling-standards.md`（§4.11）+ `architecture.md`/-zh 游标默认标准成文（兑现 §4-④）
- [x] （戊=②）示范端点 adapter/handler/controller 换 `CursorPage<T>` + 元数据锁测 + env-gated 真库 e2e 证游标语义（已手跑绿）；（戊=① 分支 N/A）

**总**
- [x] `pnpm run ci` 全绿（默认基线只增不减 348→380 passed）+ Biome 净

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | ORM 主线收尾后人择「就绪便宜预备」方向（#3+#5）；据实取证 43 抛错点 + 5 offset 端点后起草决策完备草案 | 首版：两切片 expand 设计 + 甲–戊 五归人裁点 + 完成判据（待审计门） |
| 2026-10-17 | 0.2.0 | 人签核过审计门（AskUserQuestion·取完整 scope）；盘全抛错面订正初判 43→实为 44（补 seat 402 + payment ServiceUnavailable） | §1 计数订正；§4 结论翻**已审计** + 甲–戊 逐裁定案（全 44 附码·加 errors[]·(createdAt,id)·迁 /posts）；进入实现（切片 A→CI 绿→切片 B） |
| 2026-10-17 | 0.3.0 | 两片实现完成并各自提交（A `9056fbe`、B `d9ea6af`）；游标真库 e2e 对 nestjs_practice 实跑绿 | §4 加执行完成留痕；§5 完成判据全 `[x]`（戊=②已迁·①分支 N/A）；基线 348→380 passed·只增不减 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.0 变更（两片实现完成·各自提交·§5 全 `[x]`），以当前正文内容为准。
