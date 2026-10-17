# RBAC query 级列表过滤：带 conditions 的授权在列表面下推为仓储谓词

> 适用范围: `模块(authorization〔含写侧策略闸〕 + workspaces 读链) + 公共契约（TenantPermissionChecker 端口）` ← = blast radius：新增端口方法（additive 契约·高危#2）+ 列表面读链改造（触数据隔离卡点·高危）+ 写侧 conditions 白名单放宽接受 $in（domain 策略·行为变更）+ conditions→Mikro where 受限转换器（新代码面）
> 关联: [module-rbac-dynamic-roles](./module-rbac-dynamic-roles.md) §2.4 乙裁「仅 check 级」遗留的 **query 级缓账**（本片兑现）· S4 已落 `resolveConditions`（`{{userId}}` 模板·checker.test 6 例）为其语义基 · `specs/architecture.md` §授权 · `global-tenancy` §9.3 隔离守卫
> 性质: 功能型欠账兑现（唯一遗留功能缓账）·机制单点修、不逐端点特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

dynamic-roles 片乙裁「本阶段仅 check 级实例授权」，明确登记：**带 conditions 的授权在列表面不过滤**（仅单资源读/写面有护栏），审计如实表述不粉饰（`module-rbac-dynamic-roles` §2.4 / §5）。本片兑现这条 query 级缓账。

**缺陷现状（直查钉牢·v0.3.0 据实改靶）**：
- ~~原载体 posts~~ **前提级作废（切片 A/B 实施中坐实·人裁⑤）**：`Post` 不在 RBAC subject 词汇表（`TENANT_SUBJECT_VALUES` 仅 Organization/Member/Invitation/Workspace/Role/RoleGrant），`GET /posts` 列表走 `TenantScopeGuard` 租户隔离而非 `@Can` RBAC；且 `Post` 实体无任何 per-user 实例属主列（id/title/content/published/organizationId/workspaceId/时间戳）——对 Post 取 `listPredicate` 恒 `none` 会**清空整个 posts 列表**，接入即缺陷而非修缺陷。
- **真实缺陷载体 = Workspace 列表链**（唯一「`@Can('read','Workspace')` + Mikro 仓储读链」齐备的生产端点）：`mikro-workspace.repository.list()` 组装的 `where` 只含 `tenantFilter`（organizationId），**从不消费 grant conditions** ⇒ 一个仅有「`read Workspace where <实例条件>`」这种受限授权的角色，走 `GET /workspaces` 列表仍会拿到**全租户**行（越 instance 边界的读泄漏）——与单资源 check 级护栏行为不一致。
- 如实登记：Workspace 实体现亦无实例属主列（id/name/slug/organizationId/时间戳），故 `where` 支**无天然端到端演示载体**——由单测夹具锁形；端到端实例列验证挂 缓账，待任一 RBAC subject 实体具实例属主列时兑现（不改本片机制）。【对账指针 2026-10-17】缓账已由 [module-workspace-owner-column](./module-workspace-owner-column.md) 兑现：`workspace.ownerId` 可空列 + create 链 ALS 盖章 + gated 五向端到端演示（真库）；同片发现「纯实例受限角色被路由 guard 类型级判定拦在 HTTP 入口」为**本片保守设计的真实后果**（写面无行过滤·丙裁属实），是否放宽 read 动作入类型级归人另裁，见该片 §6 v0.3.0。
- checker 原只有 `can(check)` 一个判定面（`resolveConditions` 系私有）⇒ 切片 B 已增 `listPredicate` 查询面。

**目标**：把列表面纳入同一 conditions 语义——受限授权下列表结果按实例谓词过滤，与 check 级判定**同源同口径**（机制不特判）。

**非目标**：多实例缓存一致性（Redis pub/sub·仍缓账）；`TENANT_RULES` 之外的新 subject 类型；generic OAuth 等无关面。

## 2. 方案（切片·每片可独立验证）

### 切片 A · conditions grammar 放宽（写侧闸）+ conditions→Mikro 谓词受限转换器（纯函数·落 `libs/core`）

- **前置（人裁「含 $in」坐实的必要联动）**：写侧策略闸 `isValidGrantConditions`（`tenant-rbac-policy.ts`·S1 期锁平铺原始量·注释「$in 待 S4 扩白名单再放」）**须先放宽接受 `$in`**——否则 $in 授权根本存不进库、query 级转换器成死码。新 grammar（写侧闸与读侧转换器**共用同形**·防两侧漂移）：顶层为非空对象、字段名过 `\w` 闸；每个值 ∈ ① 原始量（string/number/boolean/null·等值）② `{ $in: [原始量, ...] }`（非空数组·元素为原始量·允许 `{{userId}}` 模板元素）。其余（其它 `$` 运算符 / 直接数组值 / 非-$in 嵌套对象）仍拒。既有 `tenant-rbac-policy.test.ts` 中「`{ ownerId: { $in: [...] } }` → false」断言据实翻为 true，并补 `$gt`/裸数组/嵌套非-$in 的拒例。
- 新模块 `libs/core/src/authorization/instance-predicate.ts`（authorization 侧·纯函数·零 Nest/零 DB/零 Mikro import·产 `Record<string,unknown>` where 片段）：`toMikroPredicate(conditions, userId)` 把上述 grammar 的 conditions 译为 Mikro `FilterQuery` 片段。
  - 支持：等值（`{field: val}` → Mikro `{field: val}`）、`$in`（`{field: {$in:[…]}}` → Mikro 同名操作符）、`{{userId}}` 模板解析（复用 S4 语义·标量与 $in 元素皆解；**缺 userId ⇒ 留字面模板 = DB 等值/成员必落空 = 匹配空集**，保守 deny·与 check 级「等值落空 deny」同向）。
  - **grammar 外即 throw**（不静默放行）：嵌套非-$in 运算符（`$gt/$regex` 等）、直接数组值、空 `$in` 数组——交由切片 B 调用点 catch 后按 fail-closed 处置（双保险：写侧闸已挡·读侧再防）。
  - 完成判据：转换器单元锁测（等值 / $in / 标量与 $in 内模板解析 / 缺 userId 空集 / grammar 外 throw）+ 写侧闸新 grammar 锁测（$in 放行·$gt/裸数组/嵌套拒）。

### 切片 B · checker 端口增 `listPredicate` 查询面（契约·高危#2）【已实施·行文对齐落地形】

- `TenantPermissionChecker` 端口 additive 增方法：`listPredicate(check: TenantListPredicateRequest): Promise<TenantListPredicate>`，返回**三态判别式**（v0.3.0 行文对齐实现：替代 v0.1 「null/空集谓词」措辞——Mikro 对顶层空 `$or: []` 语义不确定，fail-closed 不赌仓储行为，空集改由调用方短路）：
  - `{kind:'all'}` = **无 instance 限制**（存在 conditions=null 类型级行 ⇒ 列表按 tenantFilter 全量·承 S2 类型级）；
  - `{kind:'where', where}` = **必须 AND 进 where 的实例谓词**（多受限行 `$or` 合并·人裁②）；
  - `{kind:'none'}` = 无租户/无角色/一行不匹配/grammar 外 conditions/加载抛错 ⇒ **fail-closed**，由 handler 短路空页**不触库**（绝不回退全量）。
- CASL 适配实现：复用 `entryFor` 缓存的 grants，筛 `action===check.action && subject===check.subject` 行——词汇表无 `manage/all` 通配，按精确等值匹配。合并规则（人裁②）：存在任一 conditions=null 行 ⇒ `all`（$or 并入 TRUE 支·与 check 级同解）；否则全部受限行交切片 A 转换器 → `$or` 合并；零匹配 ⇒ `none`。
- 完成判据：checker 侧锁测九例（`listPredicate` describe·已绿）。

### 切片 C · 列表面读链接入（Workspace·人裁⑤改靶）

- `WorkspaceRepository` 端口 `list` additive 增可选 `authorizationWhere?: Record<string, unknown>` 入参；`mikro-workspace.repository.list()` 以**固定展开序 `{ ...authorizationWhere, organizationId }`** 合并——租户盖章恒为最后键，授权谓词任何触碰 `organizationId` 的尝试被结构性覆盖（FR-5 隔离唯一卡点不变·锁测断言）。
- `TenantContextService` 增 `userId` ALS getter（`TenantContext.userId` 字段早已由中间件预注入·仅补读取面）。
- `ListWorkspacesQueryHandler` 注入 `TENANT_PERMISSION_CHECKER` + `TenantContextService`（人裁③ handler 侧），携 ALS `{organizationId, role, userId}` 取 `listPredicate({action:'read', subject:'Workspace'})` 后分流：`all`→不下推谓词（现状不变）/ `where`→下推 / `none`→直接回空页**不触库**。行为注记：无租户上下文时由旧「仓储层 403」改为「空页」——护栏面仍系上游 `TenantScopeGuard`+`TenantPermissionGuard` 双守卫（生产入口不可达该分支），列表面只收窄可见性、fail-closed 方向不变。
- 与 check 级一致性回归：同一 grant 行集 + 同一 userId 下，`listPredicate` 裁决与逐行 `can()` 裁决**同解**（写侧闸/转换器/CASL mongo 三层共 grammar 锁形）。
- 完成判据：handler 锁测（all/where/none 三分支 + listPredicate 入参携 ALS 事实）+ repo 锁测（合并序·organizationId 不可被覆盖）+ 一致性回归测；`pnpm run ci` 基线只增不减。

### 切片 D · 文档与审计对账

- `architecture.md(±zh)` 授权条款补「query 级下推」为 check 级之延伸（非新宪·承 dynamic-roles S5 已立的 DB-SSOT）；`module-rbac-dynamic-roles` §2.4/§5 缓账行标注「已由本片兑现·见索引」；README 状态翻牌。
- 完成判据：缓账措辞与实际能力一致，无「列表面不过滤」的旧表述残留于活文档。

## 3. 影响面与风险

- **高危触达**：改公共契约（端口新增方法·丁裁延续）+ 触数据隔离卡点（读链）+ **放宽写侧 conditions 白名单**（`isValidGrantConditions`·人裁「含 $in」的联动·domain 策略行为变更）→ **须人签核 + 过审计门后实施**（`AGENTS.md` §2）。零 DB schema（conditions 表 dynamic-roles S1 已建）。
- **核心风险 = over-grant 反向（underdeny）**：转换器若漏判某 conditions 支持形 → 列表意外全量 = 数据泄漏。防线：切片 A「不支持即 throw」+ 切片 B「不可解析归空集而非忽略」双 fail-closed；回归判据「列表 ⊆ 逐条」。
- **可逆性**：各切片独立 commit；端口方法 additive（旧 `can` 不动）；读链谓词为空集时等价现状，可逐片 revert。
- **风险（口径）**：conditions 的多行合并语义（`$or`）须与 CASL check 级 mongo 匹配**严格同解**，否则两层判定漂移——已定档 `$or` 并语义（§4·人裁②），回归判据「列表 ⊆ 逐条」守之。

## 4. 人类裁决定档（2026-10-17·AskUserQuestion 四裁·签署 GO）

1. **conditions 支持形边界** → 定：**含 `$in` 多值**（非仅等值+模板）。⇒ 联动放宽写侧闸 `isValidGrantConditions`（见切片 A 前置），写读两侧共用同一 grammar。
2. **多 grant 行合并** → 定：**`$or` 并语义**（任一 allow 即可见·与 CASL check 级同解；存在 conditions=null 类型级行 ⇒ `null` 全量·一行都不匹配 ⇒ 空集 fail-closed）。
3. **读链注入点** → 定：**handler 侧取**（`ListWorkspacesQueryHandler` 注 `TENANT_PERMISSION_CHECKER`·携 ALS `userId` 取 `listPredicate`·仓储保持 tenant-agnostic）。
4. **开工授权** → 定：**签核 GO·A→D 连做**（每片锁测 + L1 绿·整片完成后提请人类验收）。
5. **切片 C 载体（实施中撞出前提级缺陷后归人再裁）** → 定：**改投 Workspace 读链**（posts 作废：Post 非 RBAC subject 且无实例属主列；Workspace 为唯一 @Can + Mikro 读链齐备端点；零 schema/零词汇表改动；`where` 支端到端演示挂缓账）。

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A：转换器四态锁测绿；不支持形必 throw 有用例
- [x] 切片 B：`listPredicate` 三态锁测九例绿（all / where / $or / none fail-closed / 缓存复用）
- [x] 切片 C：Workspace 读链三分支（all/where/none）+ 「organizationId 不可被覆盖」合并序锁测 + 「listPredicate 与逐行 can() 同解」一致性回归（锁测已绿；gated e2e 因无实例属主列载体降级为单测锁形·已登 §1 缓账）
- [x] 切片 D：活文档无「列表面不过滤」旧表述（architecture 中英双份补 query 级条款·dynamic-roles §2.4/未决项翻兑现·端口注释翻正；plan/audit 历史快照按例不改写）
- [x] `pnpm run ci` 全绿·基线只增不减（实测 483→510·净增 27）+ Biome 净 + fallow 零边界违规
- [x] 端口新增方法在 architecture 有对应条款（契约↔宪对账）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人裁「3」→ 兑现 dynamic-roles §2.4 query 级缓账·依「无已审方案不写码」起草 | 首版（零代码·只提议）：直查钉牢缺陷（`list()` 仅 tenantFilter·checker 无查询面）+ 四切片（A 受限转换器纯函数 / B 端口 `listPredicate` additive 契约 / C posts 读链下推 + 一致性回归 / D 文档对账）；三条 fail-closed 防线 + 三个归人待裁点显式列出不预设 |
| 2026-10-17 | 0.2.0 | 人 AskUserQuestion 四裁定档·签署 GO（A→D 连做） | 裁点定档：①支持形=**含 $in 多值**（⇒坐实一条实现前置：写侧闸 `isValidGrantConditions` 现拒 $in·不同步放宽则 $in grant 存不进库、query 级成死码→并入切片 A 作前置·写读两侧共 grammar）②合并=**$or 并语义**（conditions=null 行→null 全量·无匹配行→空集 fail-closed·与 CASL check 级同解）③注入点=**handler 侧**④开工=**GO A→D 连做**；§2 切片 A/B 据实重写·§3 高危面补写侧闸放宽·词汇核实无 manage/all 通配（按精确 action×subject 匹配） |
| 2026-10-17 | 0.3.0 | 切片 A/B 实施中撞出 plan 前提级缺陷（Post 非 RBAC subject + 无实例属主列）·归人再裁（人裁⑤：改投 Workspace 读链） | §1 缺陷载体改靶钉牢（posts 作废理由如实登记·Workspace 为真实载体 + 「无实例列 ⇒ where 支单测锁形、端到端挂缓账」声明）·§2 切片 B 行文对齐落地三态判别式（kind 判别替代 null/空集谓词措辞·消除 Mikro 空 `$or` 语义歧义赌注）·§2 切片 C 重写（`WorkspaceRepository.list` additive `authorizationWhere` + 固定展开序保租户卡点不可覆盖 + `TenantContextService.userId` getter + 无上下文「403→空页」行为注记）·§4 补人裁⑤·§5 判据据实同步（A/B 已绿打勾） |
| 2026-10-17 | 0.3.1 | 人类验收·结项 | 人签核验收通过：A→D 四切片全部交付（实现 `66e3b0e` + 账目 `607addd` 均在 origin/main·pre-push 全量 CI 复验 PASSED）；L1 510/30（基线 483 只增不减）·Biome 净·fallow 零边界违规；§5 末项 CI 判据据实勾齐；遗留缓账如实保留：实例属主列端到端演示（待任一 RBAC subject 实体具列）·多实例缓存一致性仍归 dynamic-roles 缓账 |

---

<!-- 变更戳 -->
正文停 v0.3.0 实体变更（人裁⑤改靶 Workspace 读链·切片 B 行文对齐落地契约）；v0.3.1 仅为人类验收结项戳（仅翻 §5/§6 账行·正文未动），以当前正文内容为准。
