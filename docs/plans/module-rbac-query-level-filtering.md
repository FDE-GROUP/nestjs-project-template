# RBAC query 级列表过滤：带 conditions 的授权在列表面下推为仓储谓词

> 适用范围: `模块(authorization + posts 读链) + 公共契约（TenantPermissionChecker 端口）` ← = blast radius：新增端口方法（additive 契约·高危#2）+ 列表面读链改造（触数据隔离卡点·高危）+ CASL conditions→Mikro where 受限转换器（新代码面）
> 关联: [module-rbac-dynamic-roles](./module-rbac-dynamic-roles.md) §2.4 乙裁「仅 check 级」遗留的 **query 级缓账**（本片兑现）· S4 已落 `resolveConditions`（`{{userId}}` 模板·checker.test 6 例）为其语义基 · `specs/architecture.md` §授权 · `global-tenancy` §9.3 隔离守卫
> 性质: 功能型欠账兑现（唯一遗留功能缓账）·机制单点修、不逐端点特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

dynamic-roles 片乙裁「本阶段仅 check 级实例授权」，明确登记：**带 conditions 的授权在列表面不过滤**（仅单资源读/写面有护栏），审计如实表述不粉饰（`module-rbac-dynamic-roles` §2.4 / §5）。本片兑现这条 query 级缓账。

**缺陷现状（直查坐实）**：
- `mikro-post.repository.list()` 组装的 `where` 只含 `tenantFilter`（organizationId [+ workspaceId]）+ cursor 键集谓词，**从不消费 grant conditions** ⇒ 一个仅有「`read Post where ownerId={{userId}}`」这种受限授权的角色，走 `GET /posts` 列表仍会拿到**全租户** post（越 instance 边界的读泄漏）——与单资源 `GET /posts/:id`（走 check 级护栏·正确 deny）行为不一致。
- checker 只有 `can(check)` 一个判定面，无「给定 action/subject/userId → 返回该角色在此 subject 上的 conditions 集合」的查询面；`resolveConditions` 现系 checker 私有函数。

**目标**：把列表面纳入同一 conditions 语义——受限授权下列表结果按实例谓词过滤，与 check 级判定**同源同口径**（机制不特判）。

**非目标**：多实例缓存一致性（Redis pub/sub·仍缓账）；`TENANT_RULES` 之外的新 subject 类型；generic OAuth 等无关面。

## 2. 方案（切片·每片可独立验证）

### 切片 A · conditions→Mikro 谓词受限转换器（纯函数·落 `libs/core`）

- 新模块 `libs/core/src/authorization/instance-predicate.ts`（shared-kernel 侧·纯函数·零 Nest/零 DB）：`toMikroPredicate(conditions, userId)` 把**平铺原始量** conditions（S4 写侧策略闸已锁形：`{field: value}` 且 value 为 string/number/boolean/null）译为 Mikro `FilterQuery` 片段。
  - 支持：等值（`{field: val}`）、`{{userId}}` 模板解析（复用 S4 语义·缺 userId ⇒ 该谓词落 `false` 常量条件 = 匹配空集，**保守 deny**，与 check 级「等值落空 deny」同向）。
  - **显式不支持即 throw**（不静默放行）：嵌套操作符（`$gt/$in/$regex` 等）、`conditions` 非平铺原始量——交由切片 B 的调用点 catch 后按 fail-closed 处置。
  - 完成判据：转换器单元锁测（等值 allow / 模板解析 / 缺 userId 空集 / 不支持形 throw 各例）。

### 切片 B · checker 端口增 `listPredicate` 查询面（契约·高危#2）

- `TenantPermissionChecker` 端口 additive 增方法：`listPredicate(check: {organizationId, role, action, subject, userId}): Promise<Record<string,unknown> | null>`——语义：
  - `null` = **无 instance 限制**（该角色对此 action/subject 只有 conditions=null 的类型级授权 ⇒ 列表按 tenantFilter 全量·承 S2 类型级）；
  - 对象 = **必须 AND 进 where 的实例谓词**（多 grant 行 conditions 以 `$or` 合并·全 fail-closed：任一不可解析则并入空集条件而非忽略）；
  - 查无角色/无租户/加载抛错 ⇒ 返回**空集谓词**（`{_id: '__none__'}` 型恒不成立条件·绝不回退全量）。
- CASL 适配实现：复用 `entryFor` 缓存的 grants，筛出匹配 action/subject 且带 conditions 的行 → 交切片 A 转换器 → `$or` 合并。
- 完成判据：checker 侧锁测（类型级返回 null / 受限返回谓词 / 混合行 $or / fail-closed 空集 / 复用缓存不逐请求查库）。

### 切片 C · 列表面读链接入（posts 参考切片）

- `PostRepository` 端口 `list` 增可选实例谓词入参（或 handler 经 checker 取谓词后传入），`mikro-post.repository.list()` 把谓词 `$and` 进 `tenantFilter`；`ListPostsQueryHandler` 注入 `TENANT_PERMISSION_CHECKER`、携当前 `userId` 取 `listPredicate` 后下推。
- 与 check 级一致性回归：同一角色 + 同一 userId 下，`GET /posts` 结果集 ⊆ 逐条 `GET /posts/:id` 允许集（防两层判定漂移）。
- 完成判据：新增/gated e2e 覆盖「ownerId 模板角色列表只见自己实例」+「全量角色列表不变」；`pnpm run ci` 基线只增不减。

### 切片 D · 文档与审计对账

- `architecture.md(±zh)` 授权条款补「query 级下推」为 check 级之延伸（非新宪·承 dynamic-roles S5 已立的 DB-SSOT）；`module-rbac-dynamic-roles` §2.4/§5 缓账行标注「已由本片兑现·见索引」；README 状态翻牌。
- 完成判据：缓账措辞与实际能力一致，无「列表面不过滤」的旧表述残留于活文档。

## 3. 影响面与风险

- **高危触达**：改公共契约（端口新增方法·丁裁延续）+ 触数据隔离卡点（读链）→ **须人签核 + 过审计门后实施**（`AGENTS.md` §2）。零 DB schema（conditions 表 dynamic-roles S1 已建）。
- **核心风险 = over-grant 反向（underdeny）**：转换器若漏判某 conditions 支持形 → 列表意外全量 = 数据泄漏。防线：切片 A「不支持即 throw」+ 切片 B「不可解析归空集而非忽略」双 fail-closed；回归判据「列表 ⊆ 逐条」。
- **可逆性**：各切片独立 commit；端口方法 additive（旧 `can` 不动）；读链谓词为空集时等价现状，可逐片 revert。
- **风险（口径）**：conditions 的多行合并语义（`$or` vs 逐行独立）须与 CASL check 级 mongo 匹配**严格同解**，否则两层判定漂移——转换策略为**待归人裁点**（见 §4）。

## 4. 待人类裁决点（起草时不预设）

1. **conditions 支持形边界**：仅等值 + `{{userId}}` 模板（最保守·覆盖 ownerId 主用例），还是含 `$in`（角色多值）？推荐**先仅等值 + 模板**，其余 throw→空集。
2. **多 grant 行合并**：`$or`（任一 allow 即见·CASL 默认并语义）vs「有任一无-conditions 行即全量」？推荐 `$or` 且与 check 级同解。
3. **读链注入点**：谓词在 handler（应用层取 checker）还是在 repository（基础设施层自取）？推荐 handler 侧取（仓储保持 tenant-agnostic·承 `list-posts.query-handler.ts` 现注释）。

## 5. 完成判据（可核验 + 穷尽）

- [ ] 切片 A：转换器四态锁测绿；不支持形必 throw 有用例
- [ ] 切片 B：`listPredicate` 五态锁测绿（null / 谓词 / $or / 空集 fail-closed / 缓存复用）
- [ ] 切片 C：ownerId 角色列表只见自己 + 全量角色不变 + 「列表 ⊆ 逐条」一致性回归；gated e2e 真会话覆盖
- [ ] 切片 D：活文档无「列表面不过滤」旧表述；dynamic-roles 缓账行翻兑现
- [ ] `pnpm run ci` 全绿·基线只增不减（≥483）+ Biome 净 + fallow 零边界违规
- [ ] 端口新增方法在 architecture 有对应条款（契约↔宪对账）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人裁「3」→ 兑现 dynamic-roles §2.4 query 级缓账·依「无已审方案不写码」起草 | 首版（零代码·只提议）：直查钉牢缺陷（`list()` 仅 tenantFilter·checker 无查询面）+ 四切片（A 受限转换器纯函数 / B 端口 `listPredicate` additive 契约 / C posts 读链下推 + 一致性回归 / D 文档对账）；三条 fail-closed 防线 + 三个归人待裁点显式列出不预设 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 变更（起草·待人类审计签核），以当前正文内容为准。
