# 租户级 RBAC 动态化：Role/Permission 实体 + 实例级授权（module-rbac-dynamic-roles）

> 适用范围: `全局`（tenancy 授权核心 + schema 迁移 + 公共契约修订）
> 关联: module-rbac-casl（2026-10-17 已交付·本片改写其「表是 SSOT」裁）· global-tenancy §9.3 · 人裁 2026-10-17「自建角色+勾选权限 / 审计热改 / 实例级授权 三项全要」
> 性质: 新立项（对 CASL 换轨片的演进升格，非推翻「BA 只管认证·授权归 CASL」新宪）

## 1. 背景与目标

**人裁需求三项**（均为前片登记的「实体化触发条件」，现全部成立）：
1. 租户管理员**自建角色 + 勾选权限**（per-tenant 差异化策略）；
2. 权限**审计留痕 + 运行时热改**（合规）；
3. **resource-instance 级授权**（如「只能编辑自己创建的 workspace」）。

**勘察坐实的可行性面**（2026-10-17）：
- BA `member.role` = `z.string()` 任意字符串（organization/schema.mjs L4）——自定义角色**复用现列**存 role key，BA schema 零改动，`getActiveMemberRole` 预注入链路原样透传。
- checker 现形「规则零内置·tenant-rules 纯投影」——规则来源换形**不触碰** `@Can`/guard/端口签名（上片端口换形的预留红利）。
- CASL v7 导出面含 `mongoQueryMatcher/fieldPatternMatcher`——check 级 conditions 原生支持；query 级需受限转换器（Mikro where 非 mongo）。

**非目标**：多角色叠加（一成员一角色·`member.role` 单列语义维持）；跨租户全局角色模板；Redis 分布式缓存（单实例）。

## 2. 方案

- **§2.1 宪章改写（丙裁·取最激进档）**：`TENANT_RULES` 矩阵**整表删净**（非降格保留）：规则矩阵数据入 seed 静态数据（迁移数据脚本 + 按租户 lazy-ensure 双路），`TenantRole` 类型退化为 string（自定义角色入运行时词汇）；**仅保留编译期词汇表** `TenantSubject/TenantAction`（@Can 类型域）与新宪表述「**DB 是授权事实 SSOT、代码词汇表是语言 SSOT、CASL rules 是运行时投影**」；词汇表留 core 属主上下文（常量契约分治判据②不变）。连锁改形面（丙裁附带）：reader `toTenantRole/TENANT_ROLE_VALUES` 存在性校验、门面 DTO `@IsIn` 改内置三值∪本租自定义角色存在性。
- **§2.2 表形（甲裁）**：三表——
  - `tenant_role`（id uuid PK·organization_id FK·key·name·is_system bool·timestamps·unique(org,key)）；
  - `tenant_role_grant`（id·role_id FK cascade·subject·action·conditions jsonb NULL·unique(role,subject,action)·同格多行=OR 并集——**行式利按格审计检索**）；
  - `tenant_role_audit`（id·organization_id·actor_id·action(create/update/delete/grant/revoke)·role_key·before/after jsonb·created_at——**变更可查留库**，结构化日志单点同步一响）。
  - 迁移走 Mikro 链 generate+migrate（纯 additive）；系统角色三角色 seed 为静态死数据（owner/admin/member 不可改不可删由 is_system 应屏）。
- **§2.3 规则投影与热改（拟）**：checker 投影输入从 TS 表换「per-tenant 角色规则集」；缓存 `Map<organizationId, {version, abilityByKey}>`，授权变更同事务 bump version + 发领域事件失效（单实例内存自洽；多实例一致性留 Redis pub/sub 缓账）。deny 语义不变：词汇外 subject/action、查无角色 → 空规则全拒；lazy-ensure：租户首次解析时无角色行则 seed 三系统角色（幂等）。
- **§2.4 实例级授权（乙裁）**：本阶段**仅 check 级**——`TenantPermissionCheck` 增可选 `resource?: Record<string,unknown>`，conditions 存 CASL mongo 形（`{ownerId: "{{userId}}"}` 模板），ability 原生判；端点形状：先取资源再判。**query 级（列表过滤）缓账另片**（需仓储 find 链条件转换，风险面独立）——登记：带 conditions 的授权在列表面不过滤（仅单资源写面护栏），审计/文档如实表述不粉饰。
- **§2.5 门面与校验改形**：角色/授权管理端点挂 tenants 上下文（`@Can` 新 subject `Role`/`RoleGrant`·词汇表扩）；现 DTO `@IsIn(TENANT_ROLE_VALUES)`（成员改角色/邀请）改「内置三值 ∪ 本租户自定义角色存在性」校验；BA 内置 create-role/roles 端点维持封堵（甲裁不代建→本片自建）。
- **§2.6 审计留痕（甲裁）**：角色/授权每次变更写 `tenant_role_audit` 行（who/what/before/after/tenant）+ 结构化日志单点（PlatformAuditService 先例同构）。

**切片**（每片独立可验）：
1. ✅ **S1（已交付·L1 绿）** 三表实体+迁移+seed 静态死数据/lazy-ensure + `tenant-rules` 矩阵删净（留词汇）+ 仓储/domain（角色 CRUD·grant/revoke·conditions 白名单校验）——判据：迁移链纯 additive·seed 数据与旧矩阵逐格对拍测（一次性锁）。
2. ✅ **S2（已交付·L1 绿）** checker 规则源 DB 化 + per-tenant 缓存/失效——判据：既有 guard/matrix/门面测最小改绿 + 热改生效测（缓存失效后重查锁测）。缓存形与 over-grant 防线见 §4.1。
3. ⏳ S3 角色/授权管理门面 + 审计表落行 + DTO/reader 校验改形——判据：@Can 新格矩阵锁测 + 成员挂自定义角色往返；门面写后调 `checker.invalidateTenant(org)`（S2 已开公开失效面）。
4. ⏳ S4 check 级实例 conditions（端口增形 resource·模板解析·**消费 conditions 行**）——判据：ownerId 模板 allow/deny 锁测；query 级缓账不动仓储。
5. ⏳ S5 文档三面（architecture 授权条款/§9.3/CASL 片旧裁互引订正）+ L1 + 提交推送。

## 3. 影响面与风险

- **高危清单命中（丁裁）**：①schema 迁移（新表×2~3·纯 additive 无破坏）②公共契约修订（TenantPermissionCheck/端口注释/TENANT_RULES 语义·@Can 消费面不变）③specs 修宪（architecture 授权表述 + global-tenancy §9.1/9.3）④`.env` 不动。
- **blast radius**：guard→checker 链全请求热路径（缓存命中率即性能面）；seed 与代码表镜像防双源漂移（锁测逐格对拍）。
- **回滚**：S1 表 additive 可留；S2 起 checker 换绑回 TS 投影即回退（绑定单点）。
- **不做不臆测**：多实例一致性、mongo 全量翻译、多角色叠加——登记缓账。

## 4. 审计记录

- 结论：**已审计·GO**（人签核 2026-10-17·AskUserQuestion 四裁）——甲=《行式 grant 表 + 审计表》（三表全落库）；乙=《仅 check 级实例授权》（query 级列表过滤缓账另片，仓储 find 链不动）；丙=《全 DB 化删代码表》（TENANT_RULES 矩阵整表删净·seed 死数据双路·仅留编译期词汇表；连锁面：reader/DTO 存在性校验改形）；丁=《高危三项随片签》（schema 迁移+公共契约修订+specs 修宪）。被否备选：系统角色镜像保留（丙-1）·check+query 两层（乙-1）·JSON 列整存/仅日志审计（甲-2/3）。
- 未决项：query 级列表过滤的端点清单与转换策略（缓账片）；多实例缓存一致性（Redis pub/sub·缓账）。
- 审计人 / 日期：人（FDE·AskUserQuestion）· 2026-10-17

## 4.1 偏差留痕（实施中相对 §2 拟案的落定偏差·非改判）

- **grant 表不建 `unique(role,subject,action)`**（§2.2 拟案有）：同格多 `conditions` 行是甲裁「OR 并集」的正当形态，建唯一键会误禁；去重/撤除改应用层按 `canonicalConditions`（键序规范化串）等值比对。DB 侧仅建普通索引 `tenant_role_grant_role_subject_idx`。
- **lazy-ensure = 「查缺补种」非全有全无**：`ensureSystemRoles` 只补种缺失的系统角色 key（幂等），并发窗口下 unique(org,key) 兜底抛错上闻（不静默）。
- **seed 扩 `Role`/`RoleGrant` 管理职权格**（owner/admin·member 不可见）：预防「无人能建角色」自举死锁；此为 §2.5/DoD 新增管理面，**非旧 `TENANT_RULES` 矩阵内容**——逐格对拍测严格限在 legacy subject 域，扩格域单列锁测。
- **DTO `@IsIn` 过渡档**：成员改角色/邀请 DTO 暂维 `SYSTEM_ROLE_KEYS` 内置三值（自定义角色 S3 前有消费面·行为不变）；S3 改「SYSTEM_ROLE_KEYS ∪ 本租户存在性」——查库存在性不可作 class-validator 同步装饰式，落 service 层严格在库 fail-closed，DTO 只放宽形态校验。
- **CASL v7 类型级判定不下推 conditions（实机事实）→ S2 over-grant 防线**：带 `conditions` 的规则对 `can(action, subject)`（不带实例）返回 true（视同全量放行）。故 S2 checker 投影时**过滤掉 `conditions!==null` 行**、不参与类型级判定（保守 deny·fail-closed 方向）；conditions 行的真正消费推迟到 S4 实例判定（引入 resource 实例形）。工厂测已锁此事实。
- **缓存形落定 `Map<"${org}\u0000${key}", Promise<TenantCaslAbility>>`**（§2.3 拟案为 `Map<org,{version,abilityByKey}>`）：以在途 Promise 缓存防并发重入（同 (org,key) 首查归一），加载失败即时淘汰条目（下次重试·绝不缓存 rejected Promise 视同放行）；本阶段单实例事件未接，`invalidateTenant(org)` 为同步失效面（S3 门面写后调用）。
- **表所有权纪律**：`tenant_role`/`tenant_role_grant`/`tenant_role_audit` 三表在 `table-ownership.ts` 登记属 `tenants` 上下文（camelCase 键）；`MikroTenantRbacRepository` 为唯一写通道。
- **seed 归属随表属主迁移**：`system-role-seed.ts` 由 `tenancy/infrastructure` 迁入 `modules/tenants/domain`（三表属主为 tenants 上下文）。

## 5. 完成判据（可核验 + 穷尽）

- [ ] 自建角色端点 + 授权勾选端点可用且 @Can 裁决（管理职权仅 owner/admin 或挂 Role subject 规则）
- [ ] 热改即生效（改授权后下一请求裁决变化·无需重启·缓存失效测锁）
- [ ] 审计留痕每变更一记录（who/what/before/after/tenant）
- [ ] 实例级（乙裁仅 check 级）：带 conditions 规则下单资源 allow/deny 正确；列表面不过滤如实登记（query 级缓账另片）
- [ ] 内置三角色 seed 死数据与旧 TENANT_RULES 矩阵逐格对拍锁测（一次性）；既有 CASL 片全链测最小改绿
- [ ] BA schema 零改动（member.role 复用列实锤）·迁移纯 additive 走 generate+migrate
- [ ] `pnpm run ci` 全绿·基线 426/30 只增不减；文档三面落文

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人裁三需求成立立项 | 首版·待审计门 |
| 2026-10-17 | 0.2.0 | 审计门四裁落案 | 甲三表（行式 grant+审计表）/乙仅 check 级（query 级缓账·仓储不动）/丙全 DB 化 TENANT_RULES 矩阵删净（含 reader/DTO 连锁改形）/丁高危三项随片签；切片重排 S1–S5 |
| 2026-10-17 | 0.3.0 | S1+S2 交付对拍 | S1（三表实体+迁移落库账目闭环+seed 死数据+矩阵删净+仓储/domain+策略闸）与 S2（checker DB 规则源异步形+per-tenant Promise 缓存+invalidateTenant 失效面+over-grant 防线+四处测试适配）落地·L1 全绿 462/30（基线 426→456→462 只增）·build 绿·迁移纯 additive `0 applied` 闭环；新登 §4.1 偏差留痕八项 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.0 变更，以当前正文内容为准。
