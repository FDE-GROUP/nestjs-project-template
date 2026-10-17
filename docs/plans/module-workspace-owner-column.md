# Workspace 实例属主列：RBAC query 级 `where` 支的端到端真实载体（dynamic-roles/query-level 两片缓账兑现）

> 适用范围: `模块(workspaces 数据面 + port 契约 additive + RBAC 端到端演示)` ← = blast radius：`workspace` 表加一可空列（additive 迁移·高危#1 走人审 apply）+ 端口 `WorkspaceDraft/Record` additive 可选字段 + create 链服务端盖章·零既有行为变更
> 关联: [module-rbac-query-level-filtering](./module-rbac-query-level-filtering.md)（其 §1 显式挂账「Workspace 无实例属主列 → `where` 支仅单测锁形、端到端缓账」·本片兑现）· [module-rbac-dynamic-roles](./module-rbac-dynamic-roles.md)（实例级授权三需求之落点）· `specs/architecture.md` 授权条款（query 级 = check 级同源延伸）
> 性质: 缓账兑现（功能型欠账最后一笔）·机制单点（不逐模块特判）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

query 级列表过滤片（已验收·结项 v0.3.1）交付了 `listPredicate` 三态机制与 handler→repo 下推接线，但如实登记：**Workspace 表无实例属主列**，`kind:'where'` 支只能以单测锁形（谓词合并序/不可覆盖卡点），拿不到「受限 grant → 列表面真实只回自己行」的端到端铁证。本片给 `workspace` 加 `ownerId` 可空列并接通 create 链，使三态机制在真实 DB 上完成正/负/例外三向演示。

**语义裁定（人概括授权「你裁定·继续」2026-10-17·采以下推荐档·问责归人记录在案）**：
- ① 列名 **`ownerId`**（与 grant conditions 文档例 `{ownerId:'{{userId}}'}` 同形·`text` **可空**）；
- ② **NULL = 不属任何人**：存量行不回填——受限 grant（`where` 支）下不可见（fail-closed 自然语义），类型级 grant（`all` 支）不受影响；
- ③ 盖章单点 = `CreateWorkspaceCommandHandler` 从 `TenantContextService`（ALS）取 `userId` 填入 port `WorkspaceDraft.ownerId`——**controller body 不接受该字段**（伪造面为零），与 list 片 handler 侧取谓词同构（libs/core 注 tenancy 类已有先例）；
- ④ 加复合索引 `(organizationId, ownerId)`（`where` 支下推的真实查询面）；既有 `workspace_org_slug_idx` 不动。

**非目标（显式排除）**：owner 转移/协作人语义；update/delete 写面按 `ownerId` 限制（写面仍走现行租户 scope + `@Can` 类型级·check 级实例限制本就按 grant conditions 通用可用，不预设 owner 规则）；user_status/subscription/event 等他表加列。

## 2. 方案（切片）

### 切片 α · 数据面与 create 链接通（DB-free 可验部分先行）

- `column-meta.ts` WORKSPACE_META 增 `['ownerId', { k: 'text', nullable: true }]`（单一源双派生：运行时实体 + 迁移实体同形）+ companion `interface Workspace` 增 `ownerId?: string | null`；`four-tables.ts` 导出 interface 同步。
- port（`workspace.repository.ts`）additive：`WorkspaceDraft.ownerId?`、`WorkspaceRecord.ownerId?: string | null`；文档注明 NULL 语义②。
- `MikroWorkspaceRepository.create` 透传 `ownerId ?? null`（list 的 `authorizationWhere` 机制零改动——列在即插即用，这正是 query 级片的既有设计）。
- `CreateWorkspaceCommandHandler` 注 `TenantContextService`，`execute` 取 `this.tenant.userId` 入 Draft（无 userId 上下文→列落 NULL·fail-closed 语义②·不 throw——创建动作的上游守卫面不变）。
- 迁移工件：`pnpm run migration:generate` 产 additive 工件（ALTER TABLE ADD COLUMN + CREATE INDEX·零破坏），**SQL 文本呈人审、apply 单独签核（高危#1）后落库**；snapshot 同步。
- 锁测（DB-free）：repo 镜像测 create 载荷含 `ownerId`（值透传·缺省落 null）；handler 测 ALS userId 进 Draft（run() 上下文驱动）；meta 派生测（运行时实体含列定义）。
- 完成判据：三测绿 + 生成工件 SQL 呈审 + `pnpm run ci` 全绿（基线只增不减）。

### 切片 B · 端到端演示（apply 签核后）

- gated e2e（`apps/api/src/modules/workspaces/**` 或 tenancy e2e 邻挂·Testcontainers `ci:db` 重放链自动覆盖新工件）：真库建 org + 两用户各 create workspace → 写入受限 grant `{ownerId:'{{userId}}'}`（Workspace read）与 all-grant 各一 → 经真实 HTTP（或 handler+repo 全链）三向断言：**owner 自见** / **非 owner 受限成员盲**（含对方行不存在）/ **all-grant admin 全见**；NULL 属主行在 `where` 支下不可见补一例。
- 完成判据：gated 真库全绿 + `pnpm run ci:db` 链复验。

### 切片 γ · 账

- query-level-filtering plan §1「端到端缓账」补兑现指针（史实不改写）；dynamic-roles 未决项行同批；README 两行对账；本 plan 演变/戳。

## 3. 影响面与风险

- **高危触达**：schema 迁移（**additive·可回退 drop column**）——工件 SQL 人审 + apply 单独签核（AGENTS §2 高危#1），本 plan 审计签核≠apply 授权；port 契约 additive（消费方全仓实锤：create 仅 handler·list 签名不动）。
- **表所有权**：`workspace` 属自持表（tenancy 自有四表之一·table-ownership guard 面内）✓ 无 BA 表触达。
- **存量影响**：列可空无回填 ⇒ 既有测试/夹具零感知；`where` 支在列存在前恒不匹配（NULL ≠ 任何 userId·PG `=` NULL 为 null→假），语义 fail-closed。
- **风险**：handler 注 `TenantContextService` 值导入（DI 三重约束·query 级片同型先例照抄）；e2e 写 grant 表经 RBAC 门面/直插需与 rbac 片夹具形状一致，防自造通道。

## 4. 取证计划

1. α：三锁测进 Vitest 基线（预计 +3~4）；生成工件 diff 呈审（仅 ADD COLUMN + CREATE INDEX 两语句·无 DROP/UPDATE）。
2. B：`ci:db` Testcontainers 重放全链迁移→gated e2e 三向 + NULL 例；开发机库不手动 apply（apply 签核后走 `migration:run` 正规链）。
3. 门禁：`pnpm run ci` 全绿 + Biome 净 + fallow 佐证。

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 α：列/port/handler 三处接线 + 三锁测绿；迁移工件生成且 SQL 仅 additive（人审 apply 单独签核在案）
  （实测 +5 例入基线；工件 `Migration20261017094221` 恰两条 additive 语句·down 完全可逆；人签「签·apply」（高危#1 单点）后开发库 apply + `\d workspace` 实存核验列/索引就位）
- [x] 切片 B：gated 真库三向（自见/盲/全见）+ NULL 不可见例全绿；`ci:db` 复验
  （五向单文件全绿：盖章 201+行落 ownerId / 伪造 body 400 / guard 现状 403 登记 / where 支 B 自见且盲 NULL 行 / all 面 A 全见；列表三向采 §2B 预案档走 handler→repo 全链（guard 发现见 §6 v0.3.0）；ci:db 全链重放 4 迁移✓——env-gated 组 outbox-relay ×2 败经**不带本片文件**的三既有文件并跑决定性复现，定性为既有共享库并发互污缓账·高危#6 归人）
- [x] 切片 γ：两前置 plan 缓账指针 + README 对账
  （实测四处对账已落：query-level plan §1 缓账句尾补【对账指针 2026-10-17】兑现事实 + guard 定性；dynamic-roles §4 未决项行翻「已兑现·两笔新缓账归人」；global-ci-fullstack-pg 演变表补 v0.2.2 并发互污发现行；README 本片行翻「已完成·待人类验收」）
- [x] `pnpm run ci` 全绿（基线 ≥513 只增不减）+ Biome 净
  （实测末轮 L1 全绿：518 passed / 31 skipped（基线 513→518·+5 例；skipped +1 为新 gated e2e 文件默认跳）·fallow 0 issues·Biome 净）
- [x] README 索引 + 本 plan 演变对账，人类验收后结项
  （验收存照：人 2026-10-17 对完整验收呈报（含两笔归人缓账清单）答「你裁定，继续推进」，依 v0.2.0 先例同风作验收放行·问责归人记录在案；commit `842c609`+`0eed062` 已推 origin/main）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人令「你裁定，继续」→ 执行方择题（兑现 query 级片 §1 显式挂账的端到端缓账·索引表内唯一功能型欠账）并起草 | 首版：四语义裁定推荐档登记（列名/NULL 语义/盖章单点/复合索引）·切片 α（数据面+create 链+DB-free 锁测+工件生成呈审）→ B（gated e2e 三向）→ γ（账）；写面限制/owner 转移/回填显式非目标 |
| 2026-10-17 | 0.2.0 | 审计门：依人本轮概括授权「你裁定，继续」（先例同风「按建议自裁」）放行·问责归人记录在案；apply 签核仍单点后置 | 正文零改判·翻「已审计·实施中」；**本行登记≠schema apply 授权**（高危#1 届时单独呈审）|
| 2026-10-17 | 0.3.0 | 切片 α/B 实施·真库实跑拓出既有真缺陷两处（均自捕自修·归因干净） | ① `ensureSystemRoles` **既有缺陷修复（超出 plan 字面·如实登记）**：同批 persist role+grant → 扁平实体无 relation 依赖序·grant FK 抢跑；拆两段 flush 后又现 grant 行 `id:0` 撞 identity map 坍缩（seed 30+ 行仅落 1 行→checker 静默 fail-closed 403）——两处同修（grant/audit 不再显传自增主键）；dynamic-roles 片当时仅 mock 单测未暴露，本片 gated 真库首验坐实；既有锁测 flush 形 1→2 同批对齐+新增无 id 断言。② **guard 拦纯实例受限角色（新缓账·归人）**：路由 guard 类型级判定使 conditions-only 角色在 HTTP 入表 403（写面无行过滤故丙裁保守属实）；放宽=read 动作入类型级=已验收 checker 语义改判，本片不改（e2e 列表三向改走 §2B 预案 handler 全链 + 403 现状断言登记）。③ ci:db env-gated 组 outbox-relay 既有并发互污（决定性隔离复现·非本片引入）→高危#6 缓账归人 |
| 2026-10-17 | 0.3.1 | 切片 γ 翻账 | §5 α/B 框勾齐附实测注记；四处对账落笔（query-level §1 指针 / dynamic-roles §4 未决项 / global-ci-fullstack-pg v0.2.2 发现行 / README 索引行翻「已完成·待人类验收」）；历史 plan 均只补指针不改写正文 |
| 2026-10-17 | 0.3.2 | 人类验收·结项 | 人对验收呈报（含 guard/ci:db 两笔归人缓账清单）令「你裁定，继续推进」→ 作验收放行（概括授权依 v0.2.0 先例登记·问责归人）；两笔缓账各自另片呈审（审计未放行），本片正文零改判 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 定形（方案零改判至 v0.3.2，实施拓出的发现/缓账均登 §6 演变行不入正文）；以当前正文内容为准。
