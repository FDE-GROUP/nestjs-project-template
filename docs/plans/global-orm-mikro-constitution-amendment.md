# ORM 修宪案：Drizzle → MikroORM（B 案 · 已审计·整案 GO · 实施待逐片签核）

> 适用范围: `全局`（工具宪法级修宪 × 数据层近乎重写）← = blast radius，决定审计深度与授权粒度（`workflow.md` §3/§5）
> 关联: `specs/tooling-standards.md` §2（ORM/驱动/迁移三行 = 修宪对象）· §3（禁 Prisma/TypeORM 红线与「Drizzle 专名」口径）· §4.3（装饰器元数据与导入形态·Q2 裁决对象）· §4.4（数据库＝Drizzle 节·迁移流程·修宪对象）· §4.8（本地 CI）· `specs/workflow.md` §3（高危清单 1/2/3/4）· `research/mikro-orm-ddd-feasibility.md` **v0.2**（本文唯一事实输入源·非依据）· `research/external-borrowing-backlog.md` V4/V5 · `plans/global-runtime-node-pnpm.md`（已结项·其明文：ORM 与运行时**正交**）
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与本案性质

- 人取向（2026-10-15）：「更看重 DDD 贴合度，可考虑修宪；对接 BA 不应成为制约」→ A 勘察已成文（`mikro-orm-ddd-feasibility.md` v0.2·实机 spike）。backlog V4 登记的下一步为「人二判后**是否出 B 修宪案**」；人裁（2026-10-16）：出。
- **审计门已裁定＝整案 GO（人授意按建议自裁 2026-10-16·§5 结论），但本稿仍不是可直接开工的实施指令**：按 `workflow.md` §3「无已审方案不写码」，本文档自身不改任何代码、不装任何依赖、不动 `docs/specs`；GO 仅＝审计门放行，各切片开工前仍须人逐次明示签核（§4 高危清单 1/2/3/4）。
- **前提事实（本轮 2026-10-16 直查钉死）**：
  1. 现仓仍 Drizzle——`drizzle-orm@^0.44.7` / `drizzle-kit` / `postgres` 在册；`mikro` 于三个 package.json **零命中**；
  2. 运行时修宪（V5·Node 22 + pnpm 11.7）已于 2026-10-15 签核结项，其案明文「换 Node **非** MikroORM v7 前提、二者正交」——故本案发时证据基线是 **Bun 1.3.14**，运行时已换而证据未重采（→ 切片 0）；
  3. 勘察留档口径（切片 0 须重算钉死）：drizzle 触面 **36 文件**（其中测试 15）、`pgTable` × **14**、迁移链 `drizzle/` **9 文件**（0000–0008 + `meta/` 快照）。

## 2. 目标 / 非目标

**目标**（人取向的正面对账·引勘察 §1/§3）：

- DDD 贴合度收益机制化：UoW `onFlush`/flush 为 `AggregateRoot.pullDomainEvents` 提供天然收口点（`DomainEventPublisher` 端口签名零震动）；Identity Map + UnitOfWork 替代手写 set 式更新；全局 Filters / RLS 为 S2「仓储层唯一卡点」**叠甲**（非替代）；
- BA 接链走**官方规格内**路径（`createAdapterFactory` + `@better-auth/test-utils` 一致性套件进 CI），杜绝社区包暗坑；
- 零装饰器形态（`defineEntity` / EntitySchema）下 S9 三重约束在 ORM 侧结构性减负（勘察 §2.1·注意 `class-validator` DTO 面不受影响）。

**非目标**：

- ❌ 不再动运行时 / 包管（V5 已结项，本案与其正交）；
- ❌ 本稿不执行任何实现（审计门前只读）；
- ❌ 不做与换 ORM 无关的性能优化、不改端口契约（`shared-kernel` 的 `EventStore` / `DomainEventPublisher` / 各仓储 port 签名冻结）。

## 3. 方案（垂直切片·每片独立过审计门后执行）

宽重构走 **expand–contract**（双轨并存 → 分批迁移 → 删旧），顺序即风险递增序：

- **切片 0 · 证据补拍（Node 重跑勘察全链）**——R4/R5 的 pre-audit spike：在 Node 22 + pnpm + `postgres:16` 下重放 `mikro-orm-ddd-feasibility.md` §2.1/2.3/2.5 全部取证点（含 `tinyglobby` 在 pnpm **isolated** node_modules 下的可见性复测——V5 案的 pnpm 严格化正是本风险源），并补验勘察未测面：**organization 插件实体 / genericOAuth 回调 / additionalFields / quota 钩子**以本仓现 drizzle schema 全表面复刻。专用 scratch 库·毕已 DROP。
  完成判据：复测账目成文回写本案 §5.1；每条与勘察 v0.2 对照（绿/红/差异点名）；零仓库依赖变更。
- **切片 1 · 自持 BA adapter（开工触高危清单 2+3·待人逐片签核）**——按官方 `createAdapterFactory` 实现 8 必选 + `consumeOne` / `incrementOne` / `createSchema` 3 可选 + **`transaction`**（社区包三大缺失·勘察 §2.4）；em 一律 per-request fork（禁全局 `orm.em`·V4 串租户教训）。**契约钉点（切片 0 R4 面实测写入）**：`consumeOne`/`incrementOne` 必返**行快照 T|null**（非 boolean·否则 password-reset 恒 `Invalid token`）·raw `update` 改动值在键 `update` 带 `modelKey`·`where.connector` 大写·`supportsDates/Booleans/JSON` 置真·`transaction` 内破坏性删除用 `nativeDelete`。`@better-auth/test-utils` **authFlow 一致性套件 = 本切片强制验收判据**（已实跑 8/8）；`normalTestSuite` 因跑本仓无的合成模型（testModel/joins/arrays/json）**不作本仓验收判据**（仅佐证核心 CRUD）。把一致性套件**并入本仓 `ci` 硬门禁链**触清单 3（改 `scripts/ci.ts`），**待本切片随实现由人签核后再接**·本阶段不预改门禁。
  完成判据：**authFlow 一致性套件 EXIT=0**（作为独立 script 存在·入 `ci` 链与否待签核）；sign-up→session→DB 真行 ×3 实机存照；未动生产装配。**开工前置**：装 MikroORM v7 依赖（清单 2）+ 新增门禁 script（清单 3）须人明示签核。
  ✅ **已落地（人签核开工·Agent 照建议代裁留痕 2026-10-16·详见 §5.2）**：验收判据达成（authFlow in-repo 8/8 EXIT=0 + 真行×3 存照·默认 `ci` 基线 358 不动）。
  ✅ **门禁接入已人签核（路线 A·最小侵入·2026-10-16）**：经勘察「无条件入默认 `ci`」有两实险——需真 PG 会使无 PG 笔记本的 pre-push 直接锁死 + 破坏性 `DROP` 在 `DATABASE_URL` 误指主库时会每次 push 删真实库。人裁采**路线 A**：新增独立可选脚本 `pnpm run ci:db`（= `check → test → test:auth-consistency`），**默认 `ci`/`ci:quick`/pre-push 零改动**；同步采**安全前置**——spec 的 `resetScratchSchema` 在 `drop()` 前断言解析库名恒等于约定 scratch 名（`mikro_ba_consistency`·可经 `MIKRO_CONSISTENCY_DB` 显式换名），否则抛错拒绝。路线 B（入默认 `ci` + PG 软跳过）/ 路线 C（远程 CI + PG service·即「全栈 CI 拼 PG」专项）本次未采。
- **切片 2 · expand：单上下文试迁移**——选一个**非 BA、低触面**上下文（拟 `posts` 参考切片·定名归人）做 entity + repository adapter，新旧双轨并存，跨切面（DrizzleService / EventStore）**暂留 Drizzle**；行为对齐以**既有测试不改动仍绿**为准（禁为过测改断言）。
  完成判据：该上下文读写全走 Mikro 且回归绿；触面清单与回滚点成文。
  ✅ **已落地（人签核开工「1」·Agent 照建议代裁留痕 2026-10-16·定名＝`posts`·详见 §5.3）**：纯增量双轨·未触高危清单 1/2/3/4（零 schema 迁移/零依赖增删/零门禁/零 `docs/specs`）。验收判据达成——`posts.module.ts` 的 `POST_REPOSITORY` 唯一改绑 `MikroPostRepository`·`DrizzlePostRepository` 类与其单测**不改动仍绿**；env-gated 真库 `tenant-isolation.e2e` **5/5 EXIT=0** 证读写全走 Mikro（create 201 / list 命中经 `em`·跨租隔离不破）；默认 `ci` 基线 358 不动（新单测 +11 → **353 passed | 16 skipped (369)**）。
- **切片 3 · BA 面接链切换**——auth/tenancy/users 的数据面换自持 adapter；迁移链**交接**：以现存 PG schema 为基线生成 Mikro init migration，`drizzle/` 冻结保留不删（口径类比「push 管理的库不能直接 migrate」的既有教训）。
  完成判据：真库 migrate + seed 往返绿；`verify:prod-boot` 200；gated e2e 全链（sign-up/sign-in/session/organization）进防线脚本。
  🟡 **部分落地（人签核范围「仅 3a」·基线法 Agent 代裁·多租户优先·2026-10-16·详见 §5.5）**：**3a（迁移链交接）已完成**——忠实全模型实体集（13 表·含 FK/enum/index/unique）+ 迁移专用装配（独立于 `orm.ts`/app boot）+ 生成 init 迁移工件 + scratch 库与 Drizzle 现 schema **结构级逐表对拍全 PASS·零漂移**；**真库基线登记已于人一次性明示签核后执行**（§5.6·`checkSchema` 预检绿 + `logMigration` 基线·零数据表 DDL·`nestjs_practice` 纳入 Mikro 迁移链·`drizzle/` 冻结）。**3b（BA adapter 接链单点切换）已实现落地（§5.8·v0.10.0·`BA_ADAPTER` 双轨·缺省 drizzle·gated e2e 除 `tenant-hard-delete.e2e`（另案·既有 harness 缺陷·非本片引入）外全绿）**·**3c（app 仓储分批切）已裁采分支 B·开工方案（§5.9）+ 3c-i 已实现落地（§5.10·v0.12.0·人签核开工「实现 3c-i」）——已切 3 处已有实体覆盖仓储（platform-identity/tenant-status/suspend-user·零补实体·未触高危 1/2/3/4）**·**3c-ii 已人裁 γ（抽列元数据单一源）+ 首批 3c-ii-A 已实现落地（§5.12·v0.13.0·人签核开工「实现 3c-ii-A」）——四表列元数据单一源 + 两变体工厂·四表迁移实体经工厂重建 DDL 恒等闸 24/24 PASS（高危 1 消解·未动迁移链·基线 `Migration20261016055354` 仍有效）·运行时实体并入 `MIKRO_APP_ENTITIES`·切 4 处 CRUD（workspace/subscription 仓储·quota/user-status store）双轨不删旧·默认 ci 365/381·gated 真库 e2e seat-quota 坐实 `MikroQuotaStore`**·**3c-ii-B（read-model 整片搬）已人终裁「签核开工·按 §5.13 实现」并实现落地（§5.14·v0.13.3·`TENANT_GOVERNANCE_REPOSITORY`/`USER_GOVERNANCE_REPOSITORY` 两 useClass 改指 Mikro·双轨不删旧·R-B1 fields 投影排除凭据/R-B2 `$ilike`/R-B3 `nativeDelete(Organization)` FK cascade 均落地·未触迁移/schema/真库·默认 ci 384/400·prod-boot 200）**·**剩 3c-ii-C（EventStore 归属）未开工·待另立签核**。
- **切片 4 · contract：删旧 + 宪法修订**——删 `drizzle-orm`/`drizzle-kit`/`postgres` 依赖与残留 import；修订 `docs/specs/tooling-standards.md` §2（ORM/驱动/迁移三行）、§3 禁条（候选文案 `MikroORM + PostgreSQL（禁 Prisma/TypeORM/Drizzle 回迁）`·现条原文为「禁 Prisma / TypeORM / MongoDB 等第二套 ORM/DB —— 统一 Drizzle + PostgreSQL」·定稿归人）、§4.3（S9 形态在 defineEntity 下的退役声明·Q2）、§4.4 迁移流程、§4.8 如涉及门禁脚本、`workflow.md` §3 高危清单第 1 条命令口径、`AGENTS.md` §2/§3 指针；同步 `drizzle-migration-guide.md` 等运维文档。**本切片整体属高危，逐项人签核后方可执行。**
  完成判据：全仓 `drizzle` 命中仅剩历史文档与冻结的 `drizzle/` 目录；宪法/索引/入口三层口径一致。
- **切片 5 · 可选裁决点（Q3/Q4 已裁＝不做·本切片整体不执行）**——租户全局 Filters / RLS 采纳（Q3·勘察 §3-3「叠甲」论）· **人裁暂不采纳**；Kysely 逃生舱引入（Q4）· **人裁不引入**。→ 保留为本切片的历史占位；若将来需 Filters/RLS 加固或 Kysely，另开独立片单独审计，不随本案默认带出。

## 4. 影响面与风险

- **blast radius = 全局**；**不可逆性**：切片 3 一旦在生产数据上完成 BA 接链切换，回退需数据面迁移 → 命中高危清单 **1（schema 迁移）/ 2（删依赖删码）/ 3（改门禁·脚本链）/ 4（改 `docs/specs` 宪法）**——每一处须人明示签核，Agent 不得自行执行。
- **风险登记（对勘察 §4 R1–R6 逐条给着落）**：

| # | 风险 | 本案对策 |
|---|---|---|
| R1 | `tinyglobby` 未声明隐依赖 | 切片 0 在 pnpm isolated 下复测；采纳 v7 则显式钉依赖 + 隐式 peer 登记 |
| R2 | v7 × BA adapter 生态断裂（peer ^6） | 自持 adapter（切片 1）是唯一解；不接受社区包直用 |
| R3 | custom adapter 无运行期 `validateSchema` 通道 | 一致性套件进门禁 + `auth check schema` 显式跑；**兜底等级低于现 Drizzle 形态须人知情** |
| R4 | organization/quota/additionalFields 实体面未验 | 切片 0 第一前置；未绿则整案止步。**已补拍结清（§5.1 R4 面）：绿**——organization 三实体真行+activeOrganizationId+邀请·additionalFields 往返·quota 原生 `incrementOne/consumeOne` 原子路径·test-utils authFlow 8/8；唯 genericOAuth 外部回调 dance 未起 IdP（非 adapter 面）留实施片验 |
| R5 | MikroORM 单维护者 + v6→v7 破坏节奏 + BA 链 = 双 bus-factor | Q1 是人的风险承受裁决；本案不替人消化 |
| R6 | 工程总量（36 文件 / 14 表 / 9 迁移 / 15 测试） | expand–contract 分片；每片独立可回滚、独立过审计门 |

- **诚实面（反向代价·勘察 §3-4）**：Identity Map 长生命周期双刃（fork 纪律入 code review 清单）；SQL 显式可审性下降——本仓「审 SQL 后 migrate」纪律需适配为「快照 diff + 生成 SQL 双审」；复杂查询走逃生舱 = 新增一套心智。
- **回滚策略**：切片 0/1 零仓库副作用；切片 2 双轨并存、上下文级 revert；切片 3 合并前 A/B 分支对照、合并后回退需人签核的数据方案；切片 4 之前任何时刻可弃案止损。

## 5. 审计记录

> 无已审方案不写码。全局 / 不可逆 → 人签核。本稿审计门裁定 = **已审计 · 整案 GO**（人授意按建议自裁 2026-10-16·见 §5 结论）：然 **GO ≠ 实施片开工签核**，§4 高危清单 1/2/3/4 逐片仍须人**明示签核**后方可执行（Agent 不得自行装依赖 / 迁 schema / 改门禁 / 改 `docs/specs`）。

- **裁决点（Q1–Q4 均已裁·余下为子项）**：
  - **Q1 修宪与否 + 版本站队**：v6 保守线（现成 adapter 生态·peer ^6·属"上一代"）/ v7 + 自持 adapter + `tinyglobby` 钉死（勘察旗舰线·与 BA 生态结构性断裂）/ 维持 Drizzle 弃本案。**人裁（2026-10-16）＝ v7 + 自持 adapter**（切片 0 已据此在 Node 重采取证·见 §5.1）；
  - **Q2 装饰器立场**（EntitySchema/`defineEntity` 零装饰器形态下 S9 三重约束在 ORM entity 面的适用性声明）——**人授意按建议自裁（2026-10-16）＝采零装饰器，并显式声明 S9 三重约束在 ORM 实体面不适用**（仅约束 Controller/DTO/DI provider 注入面）；`@mikro-orm/nestjs` 装饰器路线落选。理由：切片 0 实证 `defineEntity`+UoW 全绿无需装饰器/reflect-metadata；S9 病根是构造注入类被 `import type` 擦除致 `design:paramtypes` 退化，实体非 DI 目标、与二者正交；实体保持框架无关契合 shared-kernel 端口倒置；仓储 adapter / provider 仍受 S9 约束不变；
  - **Q3 租户叠甲**（Filters / RLS 采纳与否·切片 5）——**人授意按建议自裁（2026-10-16）＝暂不采纳**（切片 5 维持默认不做）；迁移全程以既有「仓储层唯一卡点 · port 不暴露 tenantId · adapter 从 ALS 注入 · `requireTenantId` fail-closed」为隔离唯一 SSOT。理由：全局 Filters/RLS = 第二套租户谓词来源（需与卡点同步=双 SSOT 漂移），RLS 还需 per-request DB 角色切换（与连接池/现 DrizzleService 冲突）；切片 2 验收判据是「既有测试不改动仍绿」，切换期叠加隔离机制无谓放大 R6 工程与审计面→列为换库稳定后独立加固片再评；
  - **Q4 逃生舱**（是否引入 Kysely）——**人授意按建议自裁（2026-10-16）＝不引入**作一等公民；原始/复杂 SQL 走 MikroORM 自带 `em.execute` / QueryBuilder；若将来确有 Kysely 才能优雅解决的复杂查询，再按片单独审计引入。理由：钉死 Kysely=新增一套 SQL 心智（勘察 §3-4 点名此代价），与「审 SQL 后 migrate」显式可审纪律相悖，且当前无需求（YAGNY）；`em.execute`/QueryBuilder 已覆盖原生 SQL 逃生。
  - （以下两项子项**已由人授意按建议自裁·2026-10-16**）**① 切片 0 夹具口径＝追认为惯例**：pre-audit spike 采 dev 专用容器真 PG scratch 库、毕即 DROP、/tmp 删、零仓库变更（与既有 spike 验证纪律一致）；**② 一致性套件入 `ci` 硬门禁**：`authFlow` 套件钉为**切片 1 强制验收判据**（EXIT=0），但并入本仓 `ci` 链这一步触高危清单 3（改 `scripts/ci.ts`）·**待切片 1 落地时随实现由人签核后一并接入**·本阶段不改门禁脚本。
- **Agent 不得先行执行**：一切依赖增删、schema 迁移、`docs/specs` 修订、门禁改动。
- **结论（审计门裁定·2026-10-16·人授意按建议自裁·同 Q2/Q3/Q4 口径）＝整案 GO**：切片 0 已含 R4 面整体结清（§5.1），「自持 v7 adapter 足以承载本仓 BA 真实表面」核心命题**证据成立**（test-utils authFlow 8/8·organization/additionalFields/quota 功能面绿）·技术依据已具备。**但 GO 仅＝审计门放行·不等于任何实施片开工签核**：§4 明列实施逐片仍触高危清单 **1**（schema 迁移）/ **2**（装 MikroORM 依赖·删 Drizzle）/ **3**（改门禁 `scripts/ci.ts`·一致性套件入链）/ **4**（改 `docs/specs` 宪法·切片 4），且 §3「每片独立过审计门后执行」——各片动工前须人**逐次明示签核**，Agent 不得自行执行。唯余**未覆盖面**（诚实·不 overclaim）：genericOAuth 完整外部回调 dance（未起 IdP）·normal 套件 join/arrays/json 对本仓固定 schema 未覆盖（非缺陷）。
- **§5.1 切片 0 复测账目（Node 22.23 + pnpm isolated + 真 PG 15·scratch 库 `mikro_spike_v7` 已 DROP·/tmp 已删·零仓库依赖变更）**：把勘察 v0.2 钉在 Bun 1.3.14 上的证据在现运行时下重采，逐条与勘察对照——
  - **R1 消解（绿·与勘察 §2.5 同结论）**：`tinyglobby@0.2.17` 在 pnpm isolated node_modules 下可被 `@mikro-orm/core` 经 `createRequire` 解析到（`.pnpm/tinyglobby@0.2.17/…`），运行时 `fs.glob type = function` → 走 tinyglobby 而非 Node 原生 `globSync`，勘察担心的「pnpm 严格化令隐依赖不可见」在 Node 不复现；采纳 v7 仍须把 `tinyglobby` 显式钉依赖 + 隐式 peer 登记。
  - **迁移链（绿·但抓出 v7 API 换形·须写入实施片·与勘察 §2.1「初判 migrate 断」订正一致并进一步）**：`migrator.create()` 返回 `{ fileName, code, diff }`（**非** v6 的 `{ migrations: [...] }`）；查待执行用 `getPending()`（**非** `getPendingMigrations()`）；**关键坑**：`runMigrations(method, options)` 是 protected，无 method 参调用走 down/no-op 分支**静默空跑**（`executed=[]` 且列不生效），公共入口是 **`orm.migrator.up()`**——用它才真正 apply（`mikro_post` 出现 `published` 列、`mikro_migrations` 落 1 行）；schema 生命周期 v7 名变：`.create()/.update()/.drop()/.clear()`（**无** v6 的 `clearDatabase/updateSchema/createSchema`）。
  - **实体 DSL 漂移（与文档面出入·Node 同样成立）**：双向 `p.oneToMany('BlogPost').mappedBy('author')`（非 `p.many`）；反向 `p.manyToOne(User).fieldName('author_id').nullable().deleteRule('cascade')`（**非** `.field`/`.onDelete`）；主键须属性级 `p.integer().primary()`（**无**实体级 `primary:['id']`）；`p.string(255)` 位置参（非 `{length:255}`）；`p.datetime().defaultRaw('now()')` 须放 options（置 options 外侧生成 `timestamptz([object Object])`）；`Migrator` 注册为 `extensions: [Migrator]`（类·非 `new Migrator()`）。
  - **UoW / Identity Map（绿·与勘察 §2.1 一致）**：`em.create`+`flush`；同 em `findOne` 返同引用（`found===u` true）；改属性再 `flush` → 裸 SQL 见更新值。
  - **R2 决定性可解（绿·与勘察 §2.2「v7 字符串寻址必 miss」互补给出桥法）**：v7 metadata `getAll()` 是 `Map<class, meta>`、`has('User')`=false（R2 根因在 Node 复现），**但 `metadataStorage.get('User')` 按模型名仍可取** → 自持 adapter 以「模型名→entity 类」映射 + `em.getRepository(class)` 桥接即可寻址；`createAdapterFactory`（`better-auth/adapters`）返回**函数**（非构造器），BA 的 `database` 字段自定义 adapter 必须传**函数形式** `(opts) => Factory(opts)`（`adapter-base.mjs` 判 `typeof options.database === 'function'`；传对象落 kysely 分支报 `Failed to initialize database adapter`）；8 必选方法最小实现（create/update/updateMany/delete/deleteMany/findOne/findMany/count）+ 缺 `transaction` 时 BA **自动 patch + warn**（非致命·仍须切片 1 补）；**BA 接链坑（原样复现勘察 §2.3）**：① `advanced.database.generateId:false` **必须删**（BA 自生成 nanoid id，置 false 报 `Value for User.id is required`）；② BA 1.7.7 session 字段是 `expiresAt` 非 `expiresIn`，entity 须对齐。**最终全绿**：`signUpEmail 200 → getSession {user:email, session:true} → ba_user=1, ba_session=1, ba_account=1, ba_verification=0`（BA 真字段集经 create 入口日志反推：user `{name,email,emailVerified,createdAt,updatedAt,id}`、account `{accountId,providerId,userId,password,…}`、session `{expiresAt,token,…}`）。
  - **切片 0 补拍 · R4 面（2026-10-16·Node 22.23 + pnpm isolated + 真 PG 15·scratch 库 `mikro_spike_r4` 已 DROP·/tmp 已删·零仓库变更）**——把上一行声明未跑的「第一强前置」在自持 v7 adapter（7 实体扁平标量列·FK 当普通 string 列·`byModel` 小写模型名映射）上实跑：
    - **organization 插件三实体真行 + activeOrganizationId + 邀请（绿·psql 二次坐实）**：`signUpEmail(asResponse) 200 → createOrganization(headers cookie) → setActiveOrganization → createInvitation`，落库 organization/member/invitation 各 1 行、user/account/session 各 1；psql 独立证实 `session.active_organization_id = organization.id`（activeOrganizationId 经 additionalField 持久化）。
    - **additionalFields 往返（绿）**：user `isOwner`/`handle`（signup body `handle:'hello-handle'` 落库）·session `provider`/`activeOrganizationId`/`ipAddress`/`userAgent` 列对齐；authFlow 套件「sign up with additional fields」（合成 `dateField type:'date'`）经动态重建 adapter 后 ISO→Date 往返 `toStrictEqual` 通过。
    - **quota 钩子原子路径（绿）**：采 BA **原生** `incrementOne/consumeOne` 直连；以原生原子 SQL 验 `rate_limit_count` 5→(+3)→8→(−2)→6；`consumeOne` 返回形状坑见下。
    - **`@better-auth/test-utils` 一致性套件**：① **authFlow（直接相关门·8/8 全绿·EXIT=0）**——sign up / sign in / **reset password（单用 token）** / get session / invalid email / timestamps-across-timezones / additional fields 全绿；② **normal（15/108·EXIT=1·诚实标注·非本仓适用面）**——通过项=针对真实 6 表的核心 CRUD（create/findOne/findMany 空/update 空 where 返 null/delete 未命中不抛/count 0），93 失败**绝大多数是本仓 BA schema 不存在的合成模型**（`testModel`/joins/oneToOne/arrays/json/numberId/改字段名/defaultValue）→ `key()` 无对应 entity → `getRepository(undefined)` 抛 `reading 'name'`，属**模型 scope 不匹配、不构成本仓真实 schema 的 adapter 缺陷证据**（曾疑 `contains/starts_with/ends_with` LIKE 转义缺陷，实为该测试跑在 testModel 上根本未执行，订正）。
    - **自持 v7 adapter 关键契约（直查 @better-auth/core 1.7.7 `factory.mjs`/`atomic-fallback.mjs`/`internal-adapter.mjs` 坐实·补切片 0 R2 条未及者）**：① raw `update/updateMany` 改动值在键 **`update`**（非 data）且带 `modelKey`；② `where` 项 `connector` 为大写 `"AND"/"OR"` → 大小写不敏感归 `$or`；③ config `supportsDates/supportsBooleans/supportsJSON` 置真免 Date 被 ISO 化（跨时区套件因此绿）；④ **`consumeOne` 必须返回「行快照 T|null」而非 boolean**（`consumeVerificationValue` 读 `consumed.value/expiresAt`·早期误返 boolean 致 password-reset 恒 `Invalid token`）·`incrementOne` 同返回行快照；⑤ 破坏性删除在 `transaction` 上下文用 `nativeDelete`（该 fork 上 `em.removeAndFlush` 不可用）；⑥ test-utils harness：`adapter()` 须**依当前 options 动态重建**（工厂 `transformInput` 按 adapter 自身 schema 过滤 additionalFields·静态基 adapter 会剥离 `dateField`），且各套件状态隔离。
    - **仍未覆盖面（不得 overclaim）**：**genericOAuth 完整外部 HTTP 回调 dance**（飞书 `mapProfileToUser`/`accountSubject` 落 account）属 BA 内部编排 + 真实第三方 token 交换，本 spike **未起外部 IdP**，仅验 `account` 表结构可纳 accountSubject 相关字段——完整回调链仍待实施片以 mock/真渠道验；normal 套件的 join/arrays/json 能力对本仓固定 schema 亦未覆盖（本仓无此类查询）。
  - **Agent 判读建议→已由人采纳为裁定（2026-10-16·见 §5 结论）**：R4「第一强前置」的功能面（organization/additionalFields/quota）与直接相关的一致性门 authFlow（8/8·且抓出并修正常规坑 `consumeOne` 返回形状）均绿——「自持 v7 adapter 足以承载本仓 BA 真实表面」这一核心命题**证据成立**；normal 失败系合成模型 scope 不匹配、非缺陷。人据此授意照建议自裁：**整案审计门裁定＝GO**（技术依据已具备·实施逐片仍须高危签核）。
- 审计人 / 日期：FDE· Abel（人授权·Agent 照建议代裁留痕·问责归人 P2）/ 2026-10-16（审计门裁定＝整案 GO·见上 §5 结论）

### §5.2 切片 1 in-repo 实现记录（人签核开工·Node 22 + pnpm + 真 PG 15·scratch 库 `mikro_ba_consistency` 毕即 DROP）

本仓首次以**真实源码位 + 专用 vitest 配置**落地自持 v7 adapter与验收套件（非 /tmp spike）：

- **实体位（`apps/api/src/database/mikro/`）**：`entities.ts` 7 实体**零装饰器** `defineEntity`（User/Account/Session/Verification/Organization/Member/Invitation + `MIKRO_ENTITIES` 数组 + 小写模型名→entity 映射）；`isOwner: p.boolean().default(false)`、`handle: p.string().nullable()`（authFlow 走 harness 默认 options·不带本仓 additionalFields·避 NOT NULL 冲突）；Session 用 `expiresAt`（非 `expiresIn`）。
- **ORM 初始化（`orm.ts`）**：`PostgreSqlMikroORM.init`（从 `@mikro-orm/postgresql`）+ `EntityCaseNamingStrategy`（属性名**原样**作列名⇒camelCase 列·与 BA DB 字段名两侧对齐·免 snake↔camel 往返）+ `allowGlobalContext: true`。
- **自持 adapter（`mikro-auth-adapter.ts`）**：`mikroAuthAdapter(orm)` 返 `createAdapterFactory({ adapter, config })` 工厂；8 必选 + `consumeOne`/`incrementOne`/`createSchema` + `transaction`。**形态选择**：全走 **raw SQL（`em.execute(sql, params, 'all'|'get'|'run')`）**而非 entity-manager（避序列化/snake-camel/Date 不确定性·Q4 裁定允许 `em.execute` 逃生）；标识符一律双引号限定（规避 `user` 等 PG 保留字）；`compileWhere` 逐项加括号、首项无前缀、connector 大写不敏感归 OR/AND；operator 全谱（eq/ne/lt/lte/gt/gte/in/not_in/contains/starts_with/ends_with + `mode:insensitive`→ILIKE·LIKE 转义 `%`/`_`·空 `in`→`1=0`·null→`IS [NOT] NULL`）。
- **契约钉点逐条落地**：`consumeOne` 以**单语句原子** `DELETE … WHERE id IN (SELECT id … LIMIT 1) RETURNING *` 返行快照 `T|null`；`incrementOne` 以 `UPDATE … SET f=f+? WHERE … RETURNING *` 返行快照；per-op `orm.em.fork()`（禁全局 em）；`transaction` 走 `em.transactional` + **AsyncLocalStorage** 透传事务 em（破坏性删除在同一事务 em 上以原生 SQL 执行·不依赖 `removeAndFlush`）。
- **❗ 对 pinpoint③ 的形态取反（诚实留痕）**：切片 0 §5.1 记「`supportsDates` 置真」是针对 entity-manager 回**真实 Date** 的形态；本实现采 **raw `em.execute`**，v7 Kysely 层把 `timestamptz` 回传为**字符串**（如 `"2026-10-16 02:29:25.791+00"`）而非 Date——故 `supportsDates: false`，让 factory 代劳两侧 Date↔ISO 转换（首跑 5/8 因日期断言要 Date 而红·改此开关后 8/8）。`supportsBooleans/JSON` 仍置真。
- **验收套件（env-gated）**：`auth-adapter.consistency.spec.ts`（命名 `*.spec.ts`·默认 vitest include 仅收 `*.test.ts` 故不被收集）+ 专用 `vitest.consistency.config.ts`（只收本 spec·`BA_MIKRO_CONSISTENCY=1` 门控·无则 `describe.skip` 零连库）+ `pnpm run test:auth-consistency` 脚本。经 `@better-auth/test-utils` 的 `testAdapter({ adapter: async () => mikroAuthAdapter(orm), runMigrations, tests: [authFlowTestSuite()], onFinish })`（harness 动态重建 adapter·状态隔离）。
- **结果（实机）**：`test:auth-consistency` → **Tests 9 passed (9)·EXIT=0**（authFlow 8/8 + evidence 真行×3）；`ci:quick` / `ci` → **342 passed | 16 skipped (358)**（基线不动·spec 未被默认 include 收集）；`pnpm run ci` **Local CI PASSED·EXIT=0**。scratch 库 `mikro_ba_consistency` 经 dev 容器 `DROP DATABASE` 毕即清理。
- **未做（不 overclaim）**：未动生产装配（仍 Drizzle）·未改 `docs/specs`（属切片 4）。
- **门禁接入（人签核路线 A·同场补验）**：新增 `pnpm run ci:db`（独立可选·`check→test→test:auth-consistency`）**未劫持默认 `ci`/pre-push**；新增 **scratch 库名断言安全前置**（`assertScratchDb`·`drop()` 前校解析库名恒等 `mikro_ba_consistency`·否则抛错）。实机二测：① 将 `DATABASE_URL` 指向外来库 `guard_probe`→门禁拒跑且该库表 **存活**（count=1·证未误删）；② `pnpm run ci:db` 指向 scratch → **EXIT=0**（默认 `test` 358 不动 + 一致性 9/9）。scratch 毕即 DROP。

### §5.3 切片 2 in-repo 实现记录（人签核开工「1」·纯增量双轨·未触高危清单 1/2/3/4·定名＝`posts`）

把 `posts` 参考上下文的数据面从 Drizzle 单点改绑到自持 MikroORM v7 仓储适配，新旧双轨并存（`DrizzlePostRepository` 与其单测**不删不改**·作回滚点与双轨佐证）：

- **触面清单（新增 5 文件 + 改 2 接线·均不触生产其它装配）**：
  - 新增 `apps/api/src/database/mikro/post.entity.ts`——`Post` **零装饰器** `defineEntity`（8 列 `id/title/content/published/organizationId/workspaceId/createdAt/updatedAt`）+ companion `interface Post`（v7 unchained 实例形状标准写法·nullable 列取可选对齐 `em` 推断的 `T|null|undefined`）+ `MIKRO_APP_ENTITIES=[Post]`；列名经 `EntityCaseNamingStrategy` 与 `schema.ts` 物理 camelCase 列逐列对齐；跨模型 FK 当普通 string 列（无 Mikro relation 对象·DB 侧 FK 仍强制）。
  - 改 `apps/api/src/database/mikro/orm.ts`——`initMikroOrm(url, entities = MIKRO_ENTITIES)` 加 `entities` 形参（默认保 BA 一致性套件零改·app 侧传 `MIKRO_APP_ENTITIES` 令两实体集各自独立）。
  - 新增 `apps/api/src/database/mikro/mikro-orm.service.ts`——**懒建**连接持有者（构造期/`onModuleInit` 不建连·首次用到才 `ensure()` init·保 `app-boot.smoke` DB-free 与 `verify:prod-boot` 不劫持）；`fork()` 每读写取独立 em（禁全局 `orm.em`）；`onModuleDestroy` 仅曾建连时 close。
  - 新增 `apps/api/src/database/mikro/mikro-orm.module.ts`——`@Global`（沿 `DatabaseModule` 先例·`@Global` 在 `@Module` 之上）装配根·providers/exports `MikroOrmService`。
  - 新增 `apps/api/src/modules/posts/infrastructure/repositories/mikro-post.repository.ts`——实现 `PostRepository` port·`list/findById/create` 全走 Mikro `em`（`findAndCount`/`findOne`/`create`+`persist().flush()`）；**隔离唯一卡点不变**（`requireTenantId()` fail-closed **先于** 取 em·port 不暴露 tenant/workspace·`workspaceId` 仅收窄）；`updatedAt` 无 DB 触发器故写路径显式盖时间戳；`where` 因 `orm.ts` 以 `entities as never` 装配致 `em` 泛参解析为 builder 推断类型（非 companion interface）·采调用边界 `as never` cast（沿切片 1 同源惯例·非 `any`·不改运行时谓词）。
  - 改 `apps/api/src/modules/posts/posts.module.ts`——`{ provide: POST_REPOSITORY, useClass: DrizzlePostRepository }` → `MikroPostRepository`（**回滚点**：改回 `DrizzlePostRepository` 即纯双轨回退）。
  - 改 `apps/api/src/app.module.ts`——`imports` 加 `MikroOrmModule`（**回滚点**：移除该 import）。
- **新增单测**：`mikro-post.repository.test.ts`（11 例·镜像 Drizzle 测同一套隔离律 S2 FR-5 / S3 D2·§8-6·mock `MikroOrmService.fork()` 返 fake em）——断言 fail-closed 先于 fork、`where` 必含 `organizationId`（去则红）、workspace 收窄、create 盖 org/ws、Page 信封。
- **验收（实机·scratch 库 `nestjs_e2e` 经 dev 容器 `drizzle-kit push --force` 建表·非默认 CI 路径）**：`build:libs` TSC 0 issues；`build:nest` TSC 0 issues·SWC 158 files；`check` Biome 0（`check:fix` 自动整理 import/format 后净）；`test` **353 passed | 16 skipped (369)**（基线 342/358 + 新单测 11·**既有 `drizzle-post.repository.test.ts` 不改动仍绿**·`app-boot.smoke` DB-free 仍绿）；env-gated `tenant-isolation.e2e` 真库 **5 passed (5)·EXIT=0**（POST_REPOSITORY 现唯一绑 Mikro→create 201/list 命中只能经 `em` 跑通·证读写全走 Mikro·夹具 afterAll 清净 post 表 count=0）。
- **未做（不 overclaim）**：未动生产其它装配·未删 `DrizzlePostRepository`/依赖·未改 `docs/specs`·未改门禁（跨切面 DrizzleService/EventStore 暂留 Drizzle·切片 3/4 才收口）；本切片仅 `posts` 一上下文数据面切 Mikro·其余上下文仍 Drizzle。

### §5.4 切片 3 开工方案草案（**拟 · 待签核 · 未执行**·本阶段零代码零迁移）

> 依 §3 切片 3「BA 面接链切换」分解。**本小节只做现状取证与子切片设计，未动任何生产装配、未生成/未应用任何迁移**。切片 3 触高危清单 **1（迁移链交接＝schema 迁移）**与生产数据面重写——**须人明示签核后方可执行·Agent 不得自行迁 schema / 改 BA 生产装配**（§4·§5 前言）。

**现状事实（直查钉死·2026-10-16）**：

- **BA 数据面单一切换点**：`auth.implement.ts:90` `database: drizzleAdapter(drizzleService.db, { provider: 'pg', schema })`——全仓 BA 内部 CRUD（signUp/session/org/member/invitation/verification/consent）均由此一处适配器驱动。
- **自持 adapter 已就绪**（切片 1）：`mikro-auth-adapter.ts` 返**工厂函数**·接链时 `database` 须传**函数形态** `(opts) => mikroAuthAdapter(orm)(opts)`（§5.1 坑·传对象落 kysely 分支）。
- **Mikro 实体缺口**：现仅 BA 7 实体（`entities.ts`·不含 `consent`）+ `Post`（切片 2）。`schema.ts` 共 13 表；切片 3 需**新增 Mikro 实体**：`consent`（genericOAuth·BA 适配器写）/ `workspace` / `user_status` / `tenant_subscription` / `event`（后四者 app 仓储读写·`event` 属跨切面 EventStore·可归切片 4）。
- **迁移链现形态**：Drizzle 走 `drizzle-kit` 离线 `generate/migrate`（`drizzle.config.ts`·`drizzle/` 9 SQL 为 SSOT）；**Mikro 侧当前无 `migrations` 目录、未注册 `Migrator`、无 baseline**。`DrizzleService.onModuleInit` 仅 `SELECT 1`（不自动迁移）。
- **app 侧 Drizzle 触面**（非 test·26 文件）：真正「数据面读写」候选切换 = tenants×3 仓储 / users×1 仓储（+mapper）/ workspaces×1 仓储 / tenancy×4 store（platform-identity/quota/tenant-status/user-status）/ auth bootstrap+implement+seats-hook / subscriptions×1 仓储；跨切面 `drizzle-event-store` / `drizzle.service` / `database.module` / `openapi-codegen` 属切片 4 收口。

**拟子切片（各自带签核门·风险递增）**：

- **3a · 迁移链交接（高危清单 1·最前置）**：① 补 Mikro 实体（`consent`/`workspace`/`user_status`/`tenant_subscription`·`event` 视归属）并入 app-Mikro 实体集；② 注册 `extensions: [Migrator]` + `migrations: { path, tableName: 'mikro_migrations', snapshot, generator: { safe: true } }`；③ 以**现存 PG schema 为基线**用 `orm.migrator.createInitialMigration()` 生成 init migration；④ **先在 scratch 库**将生成 SQL 与现 Drizzle schema 逐表对拍（零改真实库）；⑤ **基线标记法**令 init 迁移对已存在 schema 幂等（`migrator.setExecutedMigrations()` 或手插 `mikro_migrations` 基线行·而非重跑 DDL）。`drizzle/` **冻结保留不删**（§3 口径）。→ **真库生成/应用属高危·须人签核**。
- **3b · BA adapter 接链切换**：`auth.implement.ts` 的 `database` 由 `drizzleAdapter` 换 `mikroAuthAdapter(orm)` 函数形态；orm 由全局 `MikroOrmService`（BA 实体集并入）供·注意 BA 侧现仍懒建（`verify:prod-boot` 只打 /health·但 BA 登录链路会触发真连）；回滚＝单点改回 `drizzleAdapter`（drizzleAdapter import 暂留）。验收＝切片 1 一致性套件（对已接线 app 跑）+ 全量 gated e2e（`auth-http-surface` / `tenant-isolation` / `event-store` / `hard-delete` / `seat-quota`）绿。
- **3c · app 侧 BA-table 仓储分批切 Mikro**（tenants/users/workspaces/tenancy/subscriptions）：沿切片 2 律——镜像测不改动仍绿·新旧双轨·按上下文可再分片。跨切面 `EventStore`/`DrizzleService` 留切片 4。

**归人裁点（开工前须定）**：① 本阶段范围——仅先 **3a+3b**（BA 面接链·最小可验），还是含 **3c**（app 仓储·体量大）；② 迁移基线法（snapshot-vs-empty 生成 + 幂等标记）是否采；③ 3a 真库执行的一次性签核（高危清单 1）。

> **人裁（2026-10-16·AskUserQuestion）**：本阶段范围＝**仅 3a**（先做迁移交接·不碰 3b 接链）；迁移基线法＝**归 Agent 裁定·全局考虑·多租户功能优先**。→ 执行记录见 §5.5（3a 已落地·未含 3b/3c）。

### §5.5 切片 3a 实现记录（迁移链交接·人签核范围「仅 3a」·基线法 Agent 代裁·多租户优先·未触真库/生产装配）

**执行中发现并归人上报的架构叉（诚实留痕·非臆测）**：3a 起草时把「迁移忠实」当作「补 4~5 实体 + 配 Migrator + 对拍」，但直查发现切片 1 的 BA 实体（`entities.ts`）与切片 2 的 `Post` 是**刻意扁平/有损**的（缺 `user.role` 枚举列、多处 `updatedAt`/`handle` 可空性不符、**FK 全缺**、**index/unique 全缺**）——`createInitialMigration` 按实体元数据反推 DDL，用有损实体将令 Mikro 接管未来 DDL 时**静默 DROP 这些租户关键约束**。此叉触高危清单 1（迁移链）·非 §5.4 原拟覆盖面 → **停下·上报归人**（AskUserQuestion）→ 人裁「你来裁定·全局考虑·多租户优先」。

**Agent 裁定（多租户优先）**：「遵循 BA·扁平」约束的是 **BA 适配器运行时面**（`mikro-auth-adapter.ts` 全程 raw SQL、不碰 ORM 关系元数据·已合规）；而**迁移基线要忠实**——FK cascade（NFR-6 租户级联删除）+ 复合索引（S2/S3 租户作用域读）是多租户命脉，故采**用途分离**：
- 新建**迁移专用·忠实全模型**实体集（13 表·含 FK 关系/enum/index/unique·`p.manyToOne(T).mapToPk().deleteRule(...)` 发 FK DDL 同时保持列存裸 FK 值）；
- **切片 1 `entities.ts` 与切片 2 `post.entity.ts` 一字不动** → 一致性套件 + 默认 CI 基线零回归；
- 迁移装配**独立于 `orm.ts`/app boot**（新建 `mikro-migration.config.ts`·仅离线工具按需 init·连一次性 scratch 库）→ 对运行应用/CI/生产 schema 零影响；
- **绝不**对常驻 dev/生产库跑 `migrator.up()`（真库应用＝高危清单 1·仍待人一次性签核）。

**类型映射（实测钉死·scratch 元数据反推）**：`text`→`p.text()`（**非** `p.string()`·后者发 `varchar(255)`）；`timestamp`(无 tz)→`p.datetime().columnType('timestamp')`（Mikro 默认 `p.datetime()` 发 `timestamptz`·与 Drizzle 缺省 `timestamp` 不符·须 `.columnType` 显式压回）；`DEFAULT now()`→`.defaultRaw('now()')`；`integer`→`p.integer()`；`jsonb`→`p.json()`；`bigserial`→`p.bigint('number').primary().autoincrement()`；`pgEnum('role')`→`p.enum([...]).nativeEnumName('role')`；app 级 `$onUpdate` 的 `updatedAt` **无 DB 默认**（Drizzle 亦然）。`user_status.userId`（PK+FK）Mikro 默认发 `on update cascade`·Drizzle 无 → 显式 `.updateRule('no action')` 逐字对齐。

- **触面清单（全为新增·零改动生产/切片 1·2·零真库迁移）**：
  - 新增 `apps/api/src/database/mikro/migration/migration-entities.ts`——13 表忠实全模型 + `MIKRO_MIGRATION_ENTITIES`（与 `entities.ts`/`post.entity.ts` **零交集**·schema-only·无 companion interface）。
  - 新增 `apps/api/src/database/mikro/migration/mikro-migration.config.ts`——迁移专用 `initMigrationOrm()`（`extensions:[Migrator]` + `migrations:{ path, tableName:'mikro_migrations', snapshot:true, snapshotName:'mikro-migrations' }`·**不被 `orm.ts`/`MikroOrmService`/`app.module` 导入**）。
  - 新增 `apps/api/src/database/mikro/migration/migrations/Migration<ts>.ts` + `mikro-migrations.json`——**生成的 init 迁移工件 + snapshot**（交付物）。
  - 新增 `scripts/mikro-migration-baseline.ts`——离线对拍工具（建/删一次性 `mikro_bl_*` scratch 库·`migrator.createInitial()`+scratch `up()`·按序 replay 已提交 `drizzle/*.sql` 到参考库·对 `public` 做**结构级信息模式对拍**：表/列(类型·可空·默认)/PK/唯一/索引/FK(列→引用表.列 删·改规则)·非零退出＝漂移）。
- **验收（实机·scratch-only·`bun scripts/mikro-migration-baseline.ts`）**：13 表**逐表 PASS·全部忠实·无漂移**（EXIT=0）——含 FK delete/update 规则、全部 index/unique、`role` 枚举、可空性与默认。`mikro_bl_baseline`/`mikro_bl_ref` 两 scratch 库毕即 DROP·`nestjs_practice`/生产库**未触**。
- **默认 `ci` 基线不动（纯增量）**：`pnpm run ci` **Local CI PASSED**·`build:libs`+`build:nest` 0 issues·`test` **353 passed | 16 skipped (369)**（无新单测·迁移实体/脚本非测试文件·`schema.test.ts` 仍 13·`app-boot.smoke` DB-free 不受影响）·Biome 净（`check:fix` 整理后）·fallow 平台二进制缺 → advisory only（§4.7）。
- **`drizzle/` 冻结保留不删**（§3 口径·切片 4 才收口）。
- **未做（不 overclaim·划清 3a 工件时点边界）**：本小节工件生成时点**未对真库应用**（真库基线登记经人一次性签核后另执行·见 §5.6）·**未含 3b**（`auth.implement.ts:90` BA 接链单点未动·生产仍 `drizzleAdapter`）·**未含 3c**（app 侧仓储未切）·未删 `drizzle-*` 依赖·未改 `docs/specs`·未改门禁。忠实实体集与有损运行时实体集的**双描述**是**本阶段临时态**·3b/4 收口时以忠实集取代有损 BA 实体（届时 `mikro-auth-adapter` 走 raw SQL·关系元数据不影响其运行时·可安全合并为单一 SSOT）。

### §5.6 切片 3a 真库基线登记（高危清单 1·人一次性明示签核「整链：预检+登记」2026-10-16·已执行）

> 本节是 §5.5「工件已生成·未对真库应用」的**后续闭合**：经 AskUserQuestion 人一次性明示签核整链（先只读 `checkSchema` 预检·通过即 `logMigration` 登记），方对常驻 dev 库 `nestjs_practice` 执行。

- **原理（基线登记 ≠ 重放建表）**：现网 schema 已 = Drizzle 现 schema = init 迁移目标（§5.5 已 13/13 PASS 对拍）；故正确动作是把 init 迁移**记为已执行**（`migrator.logMigration`）而非 `migrator.up()` 重跑 `create table`（对已有表会报错/误动）。MikroORM v7 `Migrator` 公共 API 实读坐实：`checkSchema()`（只读·返 `true`=漂移/`false`=一致）/`logMigration(name)`（写记账不跑 SQL）/`unlogMigration(name)`/`getExecuted()`/`getPending()`。
- **安全前置（受控脚本 `scripts/mikro-baseline-apply.ts`·bun 跑）**：① 廉价安全网 `pg_dump nestjs_practice`→`/tmp`（非仓库产物·831 行）；② **目标库名护栏**——`MIKRO_BASELINE_APPLY` 须逐等 `DATABASE_URL` 解析出的 dbName，否则拒执（EXIT=3·防误指）；③ 只读 `checkSchema` 若返漂移则中止（EXIT=2·不强登）；④ 仅 `logMigration` 单条·**零数据表 DDL**；⑤ 核验 `getExecuted` 含该条·`getPending` 空·13 表行数前后不变。
- **执行结果（实机·EXIT=0）**：目标 `db=nestjs_practice`·`checkSchema=false`（现网与 init snapshot 一致·无漂移）·`logMigration('Migration20261016055354')` 成功·`getExecuted=["Migration20261016055354"]`·`getPending=[]`·**13 表行数登记前后完全不变**（`account=2 session=3 user=4 verification=2` 余 0）；仅新增一张 `mikro_migrations` 记账表（1 行）·psql 直查坐实数据表未被触碰。
- **回滚点（零数据表影响·秒级可逆）**：`migrator.unlogMigration('Migration20261016055354')` 或 `drop table public.mikro_migrations`；极端兜底 = `/tmp` 的 `pg_dump`。
- **交接态**：`nestjs_practice` 自此**纳入 Mikro 迁移链**（未来 schema 增量走 `migrator.up()`·`drizzle/` 冻结保留不删·切片 4 才收口）。**未含 3b/3c**：BA 接链运行时仍 `drizzleAdapter`·app 侧仓储未切——本次仅完成「迁移记账基线」的物理库侧交接，数据读写路径未改。

### §5.7 切片 3b 开工方案（归人裁点已 Agent 代裁·人签核开工·**已实现见 §5.8**）

> 本小节只起草**开工方案**（直查钉死现状 + 列归人裁点）·零代码、零迁移、零依赖/门禁/`docs/specs` 变更。经人签核后方另开实现片（随实现同 commit）。切片 3a（§5.5/§5.6）已将本仓推进至「迁移链已交接 + 基线已登记」，**自然衔下一步**即 BA 数据面接链切换。

**现状直查钉死（非臆测）**：
- **单一切换点**：`auth.implement.ts:90` `database: drizzleAdapter(drizzleService.db, { provider: 'pg', schema })`——BA 全部数据读写（HTTP 面 + 服务端编排 signUp/signIn/createOrganization/hasPermission）唯此一处出口。切者即把此处改为 `mikroAuthAdapter(orm)`。
- **适配器已就绪**：切片 1 `mikro-auth-adapter.ts:107` `export function mikroAuthAdapter(orm: MikroORM)`→返工厂 `(options)=>DBAdapter`（BA `database` 自定义 adapter **必传函数形式**）；全程 raw `em.execute`、per-op `orm.em.fork()`、`transaction` 走 `em.transactional`——**运行时不依赖 ORM 关系元数据**，故与切片 3a 迁移专用忠实实体集无交叉。
- **orm 实例暴露缺口**：`MikroOrmService` 现仅 `async fork(): Promise<EntityManager>`，`orm` 私有；而 `mikroAuthAdapter` 需 **`MikroORM` 实例**（非 fork em）→ 3b 需新增一个取 orm 的出口（戒“直接向外授抛全局 em”）。
- **app-Mikro 实体集不足 BA 面**：`MIKRO_APP_ENTITIES = [Post]`（`post.entity.ts:53`）；BA 需 7 表（`MIKRO_ENTITIES` = User/Account/Session/Verification/Organization/Member/Invitation·切片 1）。`mikro-orm.service.ts:15` 注释已自陈「切片 3 换接链再并入」→ 3b 正是该并入口。
- **装配链**：`auth.bootstrap.ts:46` 将注入的 `DrizzleService` 传入 `CreateAuth`（S9：构造注入类必**值导入** + 显式 `@Inject`）→ 3b 需同形地值注入 `MikroOrmService`（或由 `AuthModule` 供 orm）。

**范围（仅 3b）**：将 auth/tenancy/users 的 **BA 数据面单点**换自持 adapter（上面的切换点）；**不含 3c**（app 侧非-BA 仓储如 posts 外的 users/quota/consent 等仍 Drizzle·沿切片 2 律分批）。不改 schema、不改依赖、不改门禁、不改 `docs/specs`。

**切换动作（描述·非执行）**：① `MikroOrmService` 加取 orm 出口（`getOrm()` 或 `createAuthAdapter()`·懒建复用同实例）；② app-Mikro 实体集并入 `MIKRO_ENTITIES`（单一 orm 兼顾 Post + BA·或独立 BA orm·归人裁）；③ `CreateAuth` 形参加 orm/MikroOrmService 依赖·`database` 按旗标取 `mikroAuthAdapter(orm)`；④ `auth.bootstrap.ts` 值导入注入新依赖 + `AuthModule` 确保 `MikroOrmModule`（@Global）可达。

**归人裁点（开工前须定）**：
1. **双轨/回滚机制**：是否用 env 旗标（如 `BA_ADAPTER=mikro|drizzle`）保留 `drizzleAdapter` 作一键回滚（类比切片 2 双轨不删旧）？还是直切 + 靠 git revert 单点回退。默认取态（mikro/drizzle）归人。
2. **实体集策略**：并入单一 app-orm vs 独立 BA-orm 实例（连接池数 / Identity Map 生命周期权衡）。raw SQL 使两者皆可行，但单一实例更贴 §3 「换接链再并入」原计。
3. **orm 出口形态**：`getOrm()`（对外暴露实例·需约束使用面）vs `createAuthAdapter()`（只返适配器·不泄 orm）。
4. **验收口径**：一致性套件是否升为切换后强制（目前 env-gated 独立 script·未入默认 `ci`）；gated e2e 全链范围（sign-up/sign-in/session/organization 邀请·member·active org / seats 配额 / 密码重置经 `consumeOne`）；**genericOAuth 外部回调 dance 仍未起 IdP**（沿用切片 0 口径·不强验·不得 overclaim）。
5. **开工签核**：3b 虽不直接命中高危清单 1–4，但是**全站最热读改写面的运行时切换**（每请求 `getSession`）·不可逆性中等→仍须人**明示签核**方可动装配。

**Agent 代裁（2026-10-16·人「你裁定就行」授权照建议自裁·问责归人 P2）**——以下为**方案裁定**·非开工授权·实现片仍待人明示签核：
- **裁点1 双轨/回滚**：采 env 旗标 `BA_ADAPTER=mikro|drizzle`（最热面**免重部署即回滚**·强于 git revert）；`drizzleAdapter` 路径 + `schema` import 不删（切片 4 才清）。默认取态：落地后 dev `.env` 置 `mikro` 取证·生产翻转归运维另行。
- **裁点2 实体集**：并入单一 app-orm——`MIKRO_APP_ENTITIES` 扩为 `[Post, ...MIKRO_ENTITIES]`（单一连接池·贴 §3「换接链再并入」原计·raw SQL 不敏感故零回归）；不建独立 BA-orm。懒建语义保持（`app-boot.smoke` 仍 DB-free）。
- **裁点3 orm 出口**：`MikroOrmService.createAuthAdapter(): Promise<factory>`（内部 `await ensure()`→`mikroAuthAdapter(orm)`·**不外泄 orm/em**）；`CreateAuth` 由同步改 async（caller 本在 `onApplicationBootstrap` 异步·无阻力）。
- **裁点4 验收**：一致性套件**不入默认 `ci`**（续路线 A·env-gated 独立 script）·本切片对其跑一次 EXIT=0；gated 真库 e2e 全链（sign-up/sign-in/session/organization 邀请·member·active org / seats 配额 / 密码重置经 `consumeOne`）EXIT=0；`verify:prod-boot` 200；默认 `ci` 基线 353/369 不动（新增单测另计）；**genericOAuth 外部回调仍不起 IdP·不强验·不 overclaim**。
- **裁点5 开工**：本代裁仅**裁定方案取值**·§5.7 已定「3b 改生产 auth 装配须人明示签核」→ **不据本代裁自行开工**·另候人明示 go。

**验收判据（拟）**：真库全链 gated e2e 绿 + 一致性套件 EXIT=0（已就绪）+ `verify:prod-boot` 200 + 租户隔离不破 + 默认 `ci` 基线 353/369 不动（新增单测另计）。

**触面清单（开工时预判）**：`auth.implement.ts` / `auth.bootstrap.ts` / `auth.module.ts` / `mikro-orm.service.ts`（加出口 + 实体并入）/ `post.entity.ts`或`entities.ts`（若采并入策略）·schema/依赖/门禁/`docs/specs` **均不改**。

**回滚点**：旗标切回 `drizzleAdapter`（双轨下 drizzle 路径 + `schema` import 不删）；无旗标则 git revert 单点 commit。BA 适配器选择与 §5.6 迁移基线**正交**（回滚不影响已登记的 `mikro_migrations`）。

**风险/诚实面**：fork 纪律入 code review（Identity Map 长生命周期双刃·§4 诚实面）；raw SQL adapter 依赖物理表名与 `EntityCaseNamingStrategy` 对齐（与 §5.6 基线同源·已对拍）；忠实/有损双描述仍存·合并为单一 SSOT 待切片 4。

### §5.8 切片 3b 实现记录（已落地·人签核开工）

> 人「签核开工·照裁定实现」（AskUserQuestion 2026-10-16）→ 照 §5.7 Agent 代裁取值实现·纯生产装配单点切换·**未触高危清单 1–4**（零 schema 迁移/零依赖增删/零门禁/零 `docs/specs`）。

**切换动作（已执行·5 文件·`auth.module.ts` 不改）**：
- `database/mikro/post.entity.ts`：`MIKRO_APP_ENTITIES = [Post, ...MIKRO_ENTITIES]`（BA 7 表并入单一 app-orm·raw SQL 不敏感故零回归·懒建不变）。
- `database/mikro/mikro-orm.service.ts`：加 `createAuthAdapter(): Promise<factory>`（内部 `await ensure()`→`mikroAuthAdapter(orm)`·不泄 orm/em）·连接日志措辞如实化。
- `modules/auth/auth.implement.ts`：`CreateAuth` 转 async·`database` 按 `BA_ADAPTER` 旗标择 `mikroAuthAdapter`/`drizzleAdapter`·**缺省 drizzle**。
- `modules/auth/auth.bootstrap.ts`：值导入 + `@Inject(MikroOrmService)`（S9）·`await CreateAuth(...)`（`MikroOrmModule` @Global 已可达）。`auth.module.ts` 零改。
- `auth.ip-trust.test.ts` / `auth.bootstrap.test.ts`：补 async + `mikroOrmService` 形参占位（drizzle 轨下桩不被调）。schema/依赖/门禁/`docs/specs` **零改**。

**验收取证（`BA_ADAPTER=mikro` vs 缺省）**：
- tsc / biome check：**0 / 0**（仅 5 存量 warning）·默认 `pnpm run ci` **PASSED**·**353 passed | 16 skipped (369)** 基线不动。
- 一致性套件（scratch `mikro_ba_consistency`）：**9/9 EXIT=0**（authFlow 8/8 + 真行·回归证 adapter/entities 未动坏）。
- gated e2e `BA_ADAPTER=mikro`（真库 `nestjs_practice`）：auth-http-surface **3/3**·tenant-isolation **5/5**·seat-quota-member **1/1** 全 EXIT=0。
- prod-boot 双轨：drizzle 轨 **200**（无 Mikro 连接·DB-free 不变量守住）·mikro 轨 **200**（`MikroORM app-orm connected (posts + BA adapter)` 坐实并入实体集建连并装配 BA 面）。

**发现相邻既有缺陷（另案·非本片引入）**：`tenant-hard-delete.e2e` 2 用例在 `beforeAll` 抛 `httpAdapter.getInstance` of undefined。三重取证坐实**与 3b 正交**——① mikro 轨失败=drizzle 轨（不设 `BA_ADAPTER`）逐字同失败；② `git stash` 回 HEAD（本片改动全清）同样失败；③ 根因＝该测用裸 `ref.init()`（不建 HTTP adapter）与 `AuthBootstrapService.onApplicationBootstrap` 需 Fastify 实例不兼容·系 **module-auth-http-surface 落地时遗留的 harness 缺陷**·因 env-gated 从不进默认 CI 长期未暴露。**归为独立另案**（修该 e2e 装配面·非 ORM 修宪范围）·本片不越界夹带（不掩盖结构缺陷·P2）。

**回滚点**：① 一键（免重部署）：`BA_ADAPTER` 置回 `drizzle`（或不设）·双轨下 `drizzleAdapter` 路径 + `schema` import 不删；② 单点：`git revert` 本片 commit。与 §5.6 迁移基线**正交**（回滚适配器不动已登记 `mikro_migrations`）。

**过渡态**：app-orm 实体集已单一化（Post + BA7）；但运行时有损实体 vs 迁移忠实实体（13 表）双描述仍并存·合并单一 SSOT 待切片 4。

### §5.9 切片 3c 开工方案（拟·直查钉死现状·待签核·未执行）

> **性质**：本草案零代码·零迁移·**未动任何生产装配**·未改 `docs/specs`/门禁；仅**勘察钉死现状 + 列归人裁点供签核**（沿 §5.7 之于 3b 的体例）。签核后方决定实现范围与是否动装配。

**现状（本轮 2026-10-16 直查·Grep 全量非测试态）**：app 侧**非-BA** Drizzle 触面 **9 处**（不含 BA 接链〔3b 双轨·drizzle 分支留切片 4 清〕与 posts 双轨）：

| # | 文件 | 涉及表 | 已有运行时实体 | 性质/难度 |
|---|---|---|---|---|
| 1 | `tenancy/infrastructure/drizzle-platform-identity.lookup.ts` | user | ✅ BA | 单表读·易 |
| 2 | `tenancy/infrastructure/drizzle-tenant-status.store.ts` | organization | ✅ BA | 单表读·易 |
| 3 | `modules/tenants/.../suspend-user.command-handler.ts` | session | ✅ BA | 命令内直连 drizzle（非仓储）·中 |
| 4 | `tenancy/infrastructure/drizzle-quota.store.ts` | member✅ / **tenant_subscription❌** | 部分 | 须补实体 |
| 5 | `tenancy/infrastructure/drizzle-user-status.store.ts` | user✅ / **user_status❌** | 部分 | 须补实体 |
| 6 | `modules/tenants/.../drizzle-user-governance.repository.ts` | user✅ / **user_status❌** | 部分 | 须补实体 |
| 7 | `modules/workspaces/.../drizzle-workspace.repository.ts` | **workspace❌** | ❌ | 须补实体 |
| 8 | `database/drizzle-event-store.ts` | **event❌** | ❌ | ES append-only·须补实体 |
| 9 | `modules/tenants/.../drizzle-tenant-governance.repository.ts` | invitation/member/org/post/**tenant_subscription**/user/**workspace** | 多❌ | 跨租户复杂查询+分页+原生 SQL·**最难** |

**核心发现（决定 3c 真身）**：MikroORM **运行时实体仅 BA 7（`entities.ts`）+ Post（`post.entity.ts`）**；那 13 张表的「迁移忠实实体」仅存于 `migration/migration-entities.ts`（282 行·仅供迁移基线 `Migration20261016055354`·**非运行时**）。故 **4 张非-BA 表（`workspace`/`user_status`/`event`/`tenant_subscription`）无运行时实体** → 3c 切这些仓储 **须先为其补运行时 Mikro 实体**，此举**正撞上切片 4「合并单一实体 SSOT」的核心议题**，且触发已知高危坑（`common_pitfalls`：*有损实体作迁移基线会静默 DROP FK/索引/列*·见 §5.5 / 记忆）。3c 因此**不是可直接闷头实现的一片**——存在归人裁决的**范围/排序岔口**。

**归人裁点（开工前须定·按建议给推荐·问责归人 P2）**：
1. **范围/排序岔口（首要）**：3c 依赖「先补运行时实体」，与切片 4「合并单一 SSOT」同一议题。三选一——**(a·推荐)** 3c 采「先易后难」分两个子片：**3c-i** 只切**已有实体已覆盖**的仓储（#1 platform-identity / #2 tenant-status 走 BA `user`/`organization` 实体·#3 suspend-user 走 BA `session` 实体——**零补实体·纯搬仓储·贴切片 2 律**），**3c-ii**  workspace/user_status/event/tenant_subscription 的**补实体 + 切换连同切片 4 的 SSOT 合并一起做**（避免先建有损新实体再合并的双份工）；**(b)** 3c 内含全部补实体（先建 4 表运行时实体·再逐仓储搬·把切片 4 的 SSOT 合并提前到 3c）；**(c)** 重排（先做切片 4 SSOT 合并·定单一 SSOT·再回头切 3c 全部仓储）。推荐 **(a)**：边界最清·3c-i 立即拿到切片 2 战果·不提前动迁移基线（高危 1）。
2. **补实体的保真律（若采含补实体的分支）**：新运行时实体须**忠实镜像**物理 schema（FK/index/enum/unique·**勿采有损**），且**不得反用作迁移基线**（避免 §5.5 坑复发）。是否以 `migration-entities.ts` 为**单一源**派生运行时实体（**消双描述·直接收编切片 4 的 SSOT 合并**）？归人。
3. **`tenant-governance.repository`（跨租户复杂读+分页+原生 SQL）**：MikroORM 侧逃生走 `em.execute`/QueryBuilder（Q4 已裁不引 Kysely）——整片搬 / 缓搬（保留 Drizzle 至切片 4 后）？其「刻意不注入租户上下文·平台级天然全量·由 `PlatformOperatorGuard` 前置把守」的隔离语义须**逐字保真**搬运取证。归人。
4. **`drizzle-event-store`（ES append-only）**：切换涉及 `DomainEventPublisher`/UoW 收口点（§2 目标·`onFlush` 拉 `pullDomainEvents`）——随本片 / 独立片？归人。
5. **分批粒度与验收**：沿切片 2 律（expand 双轨不删旧·既有测不改仍绿·真库 gated e2e 隔离不破·默认 `ci` 基线 353/369 不动·新增单测另计）；**每子片独立过审计门·独立签核**。
6. **开工签核**：3c 面广（9 仓储·含补实体岔口）·不可逆性中低（双轨可回滚）→ 仍须人**明示签核**方可动装配；补实体 + 反用于迁移基线者触**高危清单 1（schema 迁移）**须**逐项人签核**·Agent 不得自行执行。

**触面清单（开工时预判·待裁点1 定档后精化）**：3c-i（易·零补实体）→ `drizzle-platform-identity.lookup` / `drizzle-tenant-status.store` / `suspend-user.command-handler` 改绑 Mikro 仓储 + 新增对应 Mikro 单测；3c-ii（补实体·触高危 1）→ workspace/user_status/event/tenant_subscription 四表运行时实体 + 五仓储（含 tenant-governance 复杂查询·跨租户天然全量语义）。schema/**依赖**/**门禁**/**`docs/specs`** 是否改，视分支而定。

**回滚点**：沿切片 2 律——双轨并存·旧 Drizzle 仓储类与其单测不删不改（每子片一键 revert 单点 commit 或改绑回 Drizzle）；补实体分支若采（b)/(c) 触高危 1·回滚需重建·与 §5.6 迁移基线**正交**（切换仓储不改已登记 `mikro_migrations`）。

**风险/诚实面**：有损 vs 忠实双描述在补实体时收敛为单一 SSOT（若采分支 a 之 3c-ii 留待切片 4）；跨租户复杂查询搬 MikroORM 依赖原生 SQL 逃生舱与 `EntityCaseNamingStrategy` 对齐（与 §5.6 基线同源）；**genericOAuth 外部回调 dance 仍未起 IdP**（沿切片 0 口径·不强验·不得 overclaim）。**本草案仅勘察·未选定分支·未执行任何实现**。

### §5.10 切片 3c 分支裁定 + 3c-i 实现记录（已落地·人签核开工）

> 人裁（AskUserQuestion 2026-10-16）：① 3c 范围/排序 = **B**（切片 3c **内含全部补运行时实体**·把切片 4「合并单一 SSOT」提前到 3c-ii）；② 开工签核 = **实现 3c-i**。二者自洽：B 只定「谁做补实体+SSOT」（3c-ii·而非切片 4）；3c-i（已有实体覆盖·零补实体）天然先行。**本片未触高危清单 1/2/3/4**（零 schema 迁移/零依赖增删/零门禁/零 `docs/specs`）。

**切换动作（已执行·3c-i·3 处已有 BA 实体覆盖）**：
- 新增 `tenancy/infrastructure/mikro-platform-identity.lookup.ts`（`MikroPlatformIdentityLookup`·读走 BA `User` 实体 `emailOf`·`em.findOne(User, userId)`·`fork()` 取独立 em）。
- 新增 `tenancy/infrastructure/mikro-tenant-status.store.ts`（`MikroTenantStatusStore`·读写走 BA `Organization` 实体 `metadata`(json)+`updatedAt`·`load` findOne / `save` `nativeUpdate`·行不存在→undefined fail-closed）。
- 改 `modules/tenants/.../suspend-user.command-handler.ts`：注入协作者由 `DrizzleService`→`MikroOrmService`（S9 值导入）·session 硬删改 `em.nativeDelete(Session,{userId})`（旧 `db.delete(session)` 去·非仓储无独立类可双轨·回滚＝revert）。
- 改 `tenancy/tenancy.module.ts`：`TENANT_STATUS_STORE`/`PLATFORM_IDENTITY_LOOKUP` 两个 `useClass` 改指 Mikro 版（**旧 `DrizzleTenantStatusStore`/`DrizzlePlatformIdentityLookup` 类不删作双轨/回滚点**·与切片 2 同律）。
- 改 `database/table-ownership.guard.test.ts`（**机制作固·非逐模块特判**）：该守卫原为 Drizzle-only grep（`insert/update/delete(table)`）·Mikro 迁移动了 `nativeX(Entity)` 形态会令跨上下文写**静默漏检**→增强探测为 **ORM 无关**（兼识 `nativeInsert/nativeUpdate/nativeDelete(Entity)`·实体 PascalCase 首字母小写⇄schema 导出名）——session 跨写仍被坐实、`WRITE_EXCEPTIONS` 条目不再陈旧、防线更牢（**未删例外=不丢覆盖面**）。
- 改 `user-governance.command-handlers.test.ts`：suspend-user 测的协作者 mock 由 `drizzle.db.delete`同步换为 `mikro.fork()→nativeDelete`·**仍断言「失效恰好一次·失败路径不调用」**（非弱化·随协作者形状如实追踪·同 3b `CreateAuth` 测更新口径）。
- schema/依赖/门禁/`docs/specs` **零改**。

**验收取证**：
- tsc / biome check：**0 / 0**（仅 5 存量 warning）·默认 `pnpm run ci` **PASSED**·**353 passed | 16 skipped (369)** 基线不动。
- 表所有权纪律守卫：**3/3 EXIT=0**（写侧无违规 + 例外不陈旧 + owned 集全覆盖）。
- gated e2e `BA_ADAPTER=mikro`（真库 `nestjs_practice`）：auth-http-surface **3/3**·tenant-isolation **5/5**（租户墙经 `MikroTenantStatusStore` 读 org metadata 端到端 fail-closed 403 不破）·seat-quota-member **1/1** 全 EXIT=0。
- build：**TSC 0·163 文件 swc**·prod-boot 双轨 **200**（drizzle 轨无 Mikro 连接日志→store 虽无条件指 Mikro 但方法懒建·/health 不触→**DB-free 不变量守住**；mikro 轨 `app-orm connected` 坐实共享同懒建连接）。

**诚实面（不 overclaim）**：`emailOf`（PLATFORM_IDENTITY_LOOKUP）与 suspend-user session 硬删无专属真库 e2e 覆盖（仅单测 + DI 解析层面）；gated e2e 9/9 主要坐实 `TENANT_STATUS_STORE`（租户墙每请求路径）。BA 实体对有损列子集仅承载所需读/写列（email/metadata/updatedAt/userId）·与 3c-ii 补实体保真议题无涉。

**回滚点**：① `TENANT_STATUS_STORE`/`PLATFORM_IDENTITY_LOOKUP` 改绑回 Drizzle 版（类未删）；② suspend-user handler + 其测：`git revert` 本片 commit（无独立类·非旗标双轨）。与 §5.6 迁移基线正交。

**后续（待另立开工签核）**：3c-ii = 为 `workspace`/`user_status`/`event`/`tenant_subscription` 四表**补忠实运行时实体**（采 B 分支·以 `migration-entities.ts` 为单一源派生·消双描述）+ 切剩 6 仓储（含 tenant-governance 跨租户复杂查询 + EventStore）。此部分触 **高危清单 1（schema/实体保真）**·开工前须人**逐项明示签核**·Agent 不得自行执行。

### §5.11 切片 3c-ii 开工方案（拟·直查钉死现状·待签核·**未执行**·本阶段零代码零迁移）

> 范围（承接人裁分支 B）：3c-ii = 四表补运行时实体 + 剩 6 仓储切 Mikro + 收口「合并单一实体 SSOT」（原切片 4 议题提前）。**本草案仅勘察与拟策·未选定策略·未动任何生产装配·未补任何实体**。

**现状（本轮 2026-10-16 直查·读 `migration-entities.ts`/`entities.ts`/`post.entity.ts`/`mikro-orm.service.ts` + 6 仓储 + 2 store + event-store）**：

- **四表确已在迁移基线忠实建模**（`migration-entities.ts`·Workspace/UserStatus/TenantSubscription/Event·含 FK cascade·复合 index·unique·PK-FK 特殊构造如 UserStatus `updateRule('no action')`、Event `bigint autoincrement`）——故「补实体」= **提升/派生忠实实体入运行时集·非从零新建**（消双描述有物质基础）。
- **但不可直接 `import` 那四个对象进 app-orm**：migration 集用 `p.manyToOne(Organization/User/Workspace).mapToPk()` 引用**其自带**的 User/Organization/Workspace 实体对象；而 app-orm 现承载 `entities.ts` 的**扁平 BA 实体**（`p.string()` 列·`MIKRO_ENTITIES` 7 表）+ `post.entity.ts` 的 Post。若把 migration 的四表并入 `MIKRO_APP_ENTITIES`，同一物理表（`user`/`organization`/`workspace`）会出现**两套实体对象**→ `MikroORM.init` 注册冲突。**「单一 SSOT」的真实难点在此·非纯拷贝**。

**实体 SSOT 合并·三条策略岔路（归人裁点①·核心）**：
- **α 扁平孪生·双描述暂留**：为四表照运行时惯例（`p.string()` 扁平 FK 列 + companion interface·对齐 `EntityCaseNamingStrategy` camelCase）**新建运行时专用实体**并入 `MIKRO_APP_ENTITIES`；migration 集仍独立服务迁移 init。**改动最小·贴切片 2 律·零 BA 面接链风险**；代价＝双描述继续并存（与本「提前合并 SSOT」的 B 裁定精神相悖·实为把 SSOT 收口推迟回切片 4）。**推荐作为落地铁律**（运行时实体只承载仓储实际读写列子集·迁移保真由 migration 基线独担·两职分离）。
- **β 反向单一源（app-orm 改指 migration 集）**：删 `entities.ts` BA 扁平实体 + `post.entity`·运行时全用 migration 实体。**爆炸半径最大**——动已落地的切片 1/3b BA 接链面（`mikro-auth-adapter` raw SQL 依赖 `BY_MODEL` 映射 + 扁平列 + `dateField` 等运行时差异列·migration 无）+ `mapToPk` 关系与 BA raw 寻址范式不契合 → **回归风险高·违切片 1/3b 既成事实·不推荐**。
- **γ 正向抽列元数据单一源**：抽出「列忠实定义」为共享源·migration 与 runtime 实体皆由它构造。最干净但**引入偏离 Mikro `defineEntity` 直写惯例的 DSL 抽象层**·且仍需消解 `mapToPk` vs 扁平列表示差异。**工作量/风险最高·非本片必需**。

**剩 6 仓储 + 2 store + EventStore 操作形态（勘察钉死·归人裁点②③④依赖此）**：

| 单元 | 触表 | 形态要点 | 隔离/风险 | 需补实体 |
|------|------|----------|-----------|----------|
| `workspace.repository` | workspace | list(分页+`count(*)`)·create·update(带 orgId 双条件)·remove | **ALS 租户卡点**（`requireTenantId` 读过滤/写盖·foreign id 匹配 0 行）·**租户隔离回归测守** | Workspace |
| `subscription.repository` | tenant_subscription | create(1:N append·显式盖 updatedAt)·history(orderBy `periodStart` desc) | ALS 租户卡点 | TenantSubscription |
| `drizzle-quota.store` | tenant_subscription + member | 读生效行(plan/seatsLimit/providerCustomerId 投影·orderBy periodStart desc·limit1)·`count(member)` | 只读·无写 | TenantSubscription（member 已 BA） |
| `drizzle-user-status.store` | user_status + user | readStatus·userExists(BA user)·**upsert(`onConflictDoUpdate`→`em.upsert`)** | 写 user_status(PK=userId FK) | UserStatus |
| `drizzle-event-store` | event | append(nextVersion=max+1·insert·唯一键兜底)·deleteByAggregate(delete→返条数) | **跨切面 ES 端口·归属曾议留切片 4**·`bigint autoincrement` PK·jsonb payload/metadata | Event |
| `tenant-governance.repository` | org/member/invitation/workspace/post/subscription/user | **跨 6 表 CQRS read-model**：list(ilike+count+分页)·diagnostics(count×4)·exportTenantData(member **INNER JOIN user** 投影**排除凭据列** + 5 表 select)·destroy(仅删 org·FK cascade) | **刻意无租户上下文·平台级天然全量·`PlatformOperatorGuard` 前置**·隔离/凭据/count 口径须逐字保真·搬法走 `em.execute`/QueryBuilder（Q4 不引 Kysely） | Workspace + TenantSubscription |
| `user-governance.repository` | user + user_status | list(user **LEFT JOIN** user_status·ilike+count+分页·无状态行视同 active) | 同平台级天然全量·join 投影保真 | UserStatus（user 已 BA） |

**复杂 read-model 搬法（归人裁点②）**：`tenant-governance` / `user-governance` 是**跨上下文聚合读模型**（join + 列投影 + 原生 `count(*)` + ilike + 分页）·Mikro 关系/Identity-Map 范式对「扁平行投影」不贴合·强迁需大量 `em.execute` 原生 SQL（收益低·风险高：隔离语义/凭据列排除/count 口径须逐字保真并取证）。选项：**(i 推荐) 折中**——简单 CRUD 仓储（workspace/subscription/quota/user-status）先搬·**复杂 read-model 缓搬**（保留 Drizzle·推迟至切片 4 后或专项）；**(ii)** 整片搬（本片吞下全部 join 风险）；**(iii)** 全部缓搬（3c-ii 仅补实体 + 切 CRUD·read-model 整体留切片 4）。

**EventStore 归属（归人裁点③）**：`event` 属跨切面 ES 端口（`§6-丙`·DrizzleEventStore 独占写面）·§5.4 曾议「可归切片 4」。选项：并入 3c-ii 单批切 / 留切片 4 随跨切面 DrizzleService 收口（**推荐后者**·EventStore 与 `drizzle.service`/`database.module` 同属切片 4 收口面·单独提前切易撕裂）。若切：`bigint autoincrement` PK + `em.nativeDelete` 返条数 + nextVersion max+1 竞态由唯一键兜底须保真。

**分批粒度建议（归人裁点④·3c-ii 内再分·每批独立签核·触高危 1）**：
- **3c-ii-A**：按裁点① 定案补四表运行时实体 + 切 **CRUD 仓储/ store**（workspace/subscription/quota/user-status）——含租户隔离回归测复绿取证。**最小可用切片·推荐先做**。
- **3c-ii-B**（可选·独立签核）：`tenant-governance` + `user-governance` 复杂 read-model（若裁点② 采整片搬）。
- **3c-ii-C**（推荐留切片 4）：`drizzle-event-store` + `DrizzleService`/`database.module` 跨切面收口。

**高危面（workflow §3·须人逐项签核·Agent 不得自行执行）**：3c-ii **全程触高危清单 1**（补实体＝schema/实体保真·运行时实体列子集缺失虽不改迁移基线·但影响 `em` 读写列可见性与未来 `checkSchema` 口径）。**不改迁移链·不动真库·不删 Drizzle 依赖（切片 4）·不改 `docs/specs` 宪法（切片 4）**。每批实现前另候人明示签核。

**回滚点（预置）**：token 绑定类（QUOTA_STORE/USER_STATUS_STORE 等 useClass）改指 Mikro·**旧 Drizzle 类不删**（双轨/回滚点·切片 4 才清）；仓储/命令处理器无独立类者＝`git revert` 单点 commit。与 §5.6 迁移基线正交。

**风险/诚实面**：SSOT「合并」在 β/γ 才真正消双描述·α 实为推迟收口（须归人确认是否接受 B 裁定部分回退到「双描述并存至切片 4」）；复杂 read-model 搬 Mikro 依赖原生 SQL 逃生舱与 `EntityCaseNamingStrategy` 对齐（与 §5.6 基线同源）；**本草案仅勘察·未选定策略·未补实体·未执行任何实现**。

**人裁（AskUserQuestion 2026-10-16·定案）**：① SSOT 合并＝**γ 抽列元数据单一源**；② 复杂 read-model＝**整片搬**（含 tenant-governance/user-governance）；③ 首批开工签核＝**实现 3c-ii-A**（补四表实体 + 切 CRUD 仓储/store）。**γ 使 3c-ii-A 不再是「纯 CRUD 切换」——边界升级（如实上报）**：
- **γ 机制（窄口径·仅四表·BA 面不触）**：为 `workspace`/`user_status`/`tenant_subscription`/`event` 四表各定义**一份列元数据**（物理列·类型·可空·默认·index/unique·FK 目标+deleteRule/updateRule），由**工厂**从元数据派生两变体：**迁移忠实实体**（FK 走 `p.manyToOne(T).mapToPk().deleteRule()`）与**运行时实体**（FK 走扁平 `p.string()` 列 + companion interface·对齐 `EntityCaseNamingStrategy`）。**BA 七表与 Post 的现有定义不重构**（爆炸半径隔离）——四表在 `migration-entities.ts` 的旧写法改为消费共享元数据源。
- **不可妥协安全闸（实现第一硬检查点）**：四表迁移实体经工厂重建后，Mikro schema 生成器**必须产出逐字节相同 DDL**——验证序：scratch 逐表对拍仍 **13/13 零漂移** + 真库 `checkSchema` **无漂移**（因 `Migration20261016055354` 已在 `nestjs_practice` 登记·若 DDL 有任何差异即与已登记基线漂移）。**若无法证明恒等→立即停下上报·不推进任何 app 侧切换**（高危 1 核心·不得自行放行）。
- **实现序**（每步验证后再下一步）：（i）抽四表列元数据源 + 工厂 ·（ii）重建 `migration-entities.ts` 四表消费它·**先证 DDL 恒等**（对拍+checkSchema）·（iii）新增四表运行时实体并入 `MIKRO_APP_ENTITIES`（伴 companion interface）·（iv）切 CRUD 仓储/store（workspace/subscription/quota/user-status·沿切片 2 律双轨不删旧）·（v）租户隔离回归测复绿 + 默认 ci 基线不动 + gated e2e + build/prod-boot。
- **read-model 整片搬（裁②）归 3c-ii-B**·本批（A）不做·待 A 落地并验后另立签核。

### §5.12 切片 3c-ii-A 实现记录（γ 抽列元数据单一源·四表补实体 + 切 CRUD 仓储/store·已落地·人签核开工）

**范围**：裁①γ + 裁③首批 A 落地——四表列元数据单一源 + 两变体工厂 + 并入 `MIKRO_APP_ENTITIES` + 切 4 处 CRUD（workspace/subscription 仓储·quota/user-status store）·双轨不删旧。**read-model 整片搬（tenant-governance/user-governance）＝ 3c-ii-B·本批未做**·EventStore 归属（裁③④）＝ 3c-ii-C / 切片 4·本批未动。

**新增/改动（源码位 `apps/api`·真实装配）**：
- `database/mikro/column-meta.ts`（新）：`ColKind` 判别联合 + `TableMeta` + `buildMigrationEntity(meta,targets)`（FK 走 `p.manyToOne(T).mapToPk().deleteRule/updateRule/primary`）+ `buildRuntimeEntity(meta)`（FK 走扁平 `p.string()`）·builder 链局部 `any`（v7 动态按种类重建链静态类型面无法精确承载·迁移实体不被实例化·运行时形状由 companion interface 兜·DDL 保真由恒等闸而非类型系统背书）。
- `database/mikro/four-tables.ts`（新·四表唯一真相源）：`WORKSPACE/USER_STATUS/TENANT_SUBSCRIPTION/EVENT_META`（列/类型/可空/默认/index/unique/FK 目标+规则）+ 4 companion `interface` + 4 `buildRuntimeEntity` 派生运行时实体 + `MIKRO_FOUR_TABLE_ENTITIES`。
- `database/mikro/migration/migration-entities.ts`：四表旧手写 `defineEntity` 块改为 `buildMigrationEntity(X_META, { User, Organization })` 消费同源元数据（`MIKRO_MIGRATION_ENTITIES` 数组不变·Post 仍手写）。
- `database/mikro/post.entity.ts`：`MIKRO_APP_ENTITIES = [Post, ...MIKRO_ENTITIES, ...MIKRO_FOUR_TABLE_ENTITIES]`（四表运行时实体并入·表集与 BA 七表+Post 互斥无交叉）。
- 4 处适配器（新·镜像切片 2 律）：`mikro-workspace.repository.ts`（ALS `requireTenantId()` fail-closed 先于取 em·`findAndCount` 分页 createdAt ASC / `em.create`+`persist.flush` 盖租户 / `findOne({id,organizationId})` 双条件改 / `nativeDelete({id,organizationId})` 双条件删）·`mikro-subscription.repository.ts`（ALS·create 显式盖 createdAt/updatedAt+periodStart=now·history `find` periodStart DESC）·`mikro-quota.store.ts`（`tenantId` 参数·非 ALS·`find` 生效投影 limit1 + `em.count(Member)`）·`mikro-user-status.store.ts`（`findOne` 主键·upsert 命中 `nativeUpdate`（不回盖 createdAt）/未命中 `create`+`persist`·严格复刻 Drizzle `onConflictDoUpdate`·`UserStatus` 主键 `userId` 非 `id`→一律 `{ userId }` 过滤对象寻址）。
- 3 处绑定改指 Mikro（旧 Drizzle 类不删作回滚点）：`workspaces.module.ts`（WORKSPACE_REPOSITORY）·`subscriptions.module.ts`（SUBSCRIPTION_REPOSITORY）·`tenancy.module.ts`（USER_STATUS_STORE / QUOTA_STORE）。
- 2 单测（新·镜像隔离律非弱化）：`mikro-workspace.repository.test.ts`（9 例·fail-closed 先于 fork·list 恒带 organizationId·update/remove 双条件·Page 同形·空草稿不 flush）·`mikro-subscription.repository.test.ts`（3 例·fail-closed·create 盖租户+status=active+时间戳·history 恒带 tenantId+periodStart DESC）。quota/user-status store 无专属单测（与 3c-i `MikroTenantStatusStore` 同构·非 ALS·卡点在 core `QuotaService`/`UserStatusService`）。

**DDL 恒等安全闸（第一硬检查点·达成）**：新增 `scripts/mikro-ddl-identity.ts` + `scripts/mikro-ddl-golden.sql`。机制（**对 §5.11 拟定验证序的如实修正**）：旧对拍工具 `mikro-migration-baseline.ts` 因 `migrations/` 已含已提交 `Migration20261016055354` 无法 `createInitial`→改建「scratch 库 `mikro_idl_ref` 应用 Drizzle 权威 SQL→`orm.schema.getUpdateSchemaSQL()` 取实体对齐 Drizzle 库需发 DDL→归一（拆/折叠/去噪/排序）golden 自比对」。**结果：γ 重构四表迁移实体后 `check` 逐行相同 24/24 PASS**——24 条全为 FK 约束**命名约定差异噪声**（Drizzle `<表>_<列>_<引用表>_<引用列>_fk` vs Mikro `<表>_<列>_foreign`·列/引用/规则全同·非真实漂移）；列缺失/类型/可空/默认/index/unique 漂移均会产对应 ALTER 被捕获→**证已登记基线 `Migration20261016055354` 仍有效·迁移链零动**（高危 1 核心风险消解）。闸只建/删 scratch·不触真实库·未对真库应用任何迁移。

**验收（实机）**：tsc EXIT=0·Biome `check` EXIT=0（自动修 8 文件格式·余 5 warn 系恒等闸脚本非空断言·不拦门禁）·**默认 `ci` 365 passed \| 16 skipped (381)**——既有 353 全绿·新增 12 双轨隔离测（9 workspace+3 subscription）·表所有权守卫 3/3 绿（Mikro `nativeX(Entity)` 写面纳入·无新例外）·DDL 恒等闸 24/24 PASS·`build:nest` TSC 0/SWC 169 文件·`verify:prod-boot` 200（Mikro 四表运行时实体并入后整树 DI 解析·懒建未触发→DB-free 守住）·**gated 真库 e2e**（scratch `nestjs_e2e`·drizzle push 同步 schema）：`seat-quota-member` 1/1（坐实 `MikroQuotaStore.countMembers`+`currentActiveSubscription` 回落 FREE_PLAN 走真库）·`tenant-isolation` 5/5·`event-store` 5/5 全绿·`tenant-hard-delete` **既有 harness 缺陷**（裸 `ref.init()` 无 Fastify adapter·`AuthBootstrapService.onApplicationBootstrap` 抛）经 **stash 回退本切片改动复现同错** 三重取证坐实**非本片引入**（沿 §5.10/3b 既有另案·不越界夹带修）。

**诚实面（未覆盖面）**：`MikroWorkspaceRepository`/`MikroSubscriptionRepository`/`MikroUserStatusStore` **无专属真库 e2e**（仅 mock 单测 + prod-boot DI·未跑真实 workspace/subscription 写面与 user_status upsert 往返·写面对齐靠运行时实体 camelCase⇄物理列约定 + DDL 恒等闸间接背书）·read-model 整片搬归 3c-ii-B·EventStore 未切（3c-ii-C/切片 4）。**高危触及面**：本批触高危 1（迁移实体经工厂重建）·**未做真库 schema 迁移·未删依赖·未改 `docs/specs`/门禁**·旧 Drizzle 仓储/store 类不删（回滚点）·真库基线（§5.6）正交不受影响。

### §5.13 切片 3c-ii-B 开工方案（read-model 整片搬 · tenant-governance/user-governance · 已签核·已落地（实现记录见 §5.14））

> 状态：Agent 据 §5.11 裁②「整片搬」起草本批实现方案。经 2026-10-16 人裁（AskUserQuestion）：下一批＝3c-ii-B·流程＝先方案后实现→探针取证结清 R-B1/R-B2→终裁「**签核开工·按 §5.13 实现**」→**已落地（见 §5.14）**。

**范围**：新增两处平台级治理读模型的 Mikro 适配器并单点改绑 token——`MikroTenantGovernanceRepository`（实现 `TenantGovernanceRepository`：`list`/`findById`/`diagnostics`/`exportTenantData`/`destroy`）+ `MikroUserGovernanceRepository`（实现 `UserGovernanceRepository`：`list`）。**双轨不删旧**（`DrizzleTenantGovernanceRepository`/`DrizzleUserGovernanceRepository` 类与其单测原样留作回滚点·仅从 `tenants.module.ts` 移除 import + useClass 改指 Mikro）。**不触迁移实体 / DDL / 迁移链**（消费 3c-ii-A 已并入的运行时实体）。

**现状直查（钉死·全依赖实体已就绪）**：治理读面所需 8 实体**均已存在 Mikro 运行时定义**——`Organization`/`Member`/`Invitation`/`User`（`entities.ts`·BA 七表）+ `Workspace`/`TenantSubscription`/`UserStatus`（`four-tables.ts`·3c-ii-A）+ `Post`（`post.entity.ts`），**B 无需补任何实体**。Drizzle 现实现语义（须逐方法对齐）：`tenant-governance.list` = org `ilike(name|slug)` + `createdAt DESC` + limit/offset + 独立 `count(*)`；`findById`=单 org 行 + `metadata`→`readTenantStatus ?? ACTIVE`；`diagnostics`=findById + 四表（member/invitation/workspace/post）按 `organizationId` 各一 `count(*)`（未知租户→单查即返 null·不计数）；`exportTenantData`=org 全列 + member **INNER JOIN user**（**投影仅 id/name/email/handle·凭据列 password 等在 SQL select 面排除**）+ invitation/workspace/tenant_subscription/post 四段（**均无 status 过滤·deleted 终态可导**·未知租户→单查返 null）；`destroy`=仅删 org 主行·**五子表由 DB FK `onDelete:cascade` 自动消灭**（应用层不逐表删·不预查）。`user-governance.list` = user `ilike(name|email)` + **LEFT JOIN user_status** + `createdAt DESC` + 独立 count·无记录行 `status ?? ACTIVE`。

**操作形态映射（Drizzle→Mikro·per-fork em）**：
- `list` 过滤+分页+总数 → `em.findAndCount(Organization, where, { orderBy: { createdAt: QueryOrder.DESC }, limit, offset })`（`findAndCount` 返 `[items, total]`·count 不带 order/limit·与 Drizzle 分离 count 同义）。
- `findById` → `em.findOne(Organization, id)`（PK 裸串可用）·`metadata` 经 companion 取回→`effectiveStatus`。
- `diagnostics` 四计数 → `em.count(Member/Invitation/Workspace/Post, { organizationId } as never)`×4（未知租户先 `findOne` 短路 null）。
- `exportTenantData` → org `findOne`（全列）+ `em.find(Member,{organizationId})` 取 userId 集→`em.find(User,{ id: { $in: userIds } }, { fields: ['id','name','email','handle'] })` 拼接名册（**`fields` 投影在 SQL 层只取四列·password 绝不入 SELECT**）+ invitation/workspace/subscription/post 各 `em.find(...,{organizationId/tenantId})`（无 status 过滤）。
- `user-governance.list` → `em.findAndCount(User, search, {orderBy,limit,offset})` + `em.find(UserStatus,{ userId: { $in: pageUserIds } })` 建 Map 拼接·缺省→`ACTIVE`（LEFT JOIN 语义以「二次批量取状态 + 内存合并」折叠·**不逐用户 N+1**）。
- `destroy` → `em.nativeDelete(Organization, { id })` 返 affected（**纯 SQL DELETE·子表 FK cascade 由 DB 执行·绝不用 `em.remove` 以免 ORM 级联/身份图分歧**）·`>0` 为 true。

**不可妥协保真闸（实现第一硬检查点·逐条验后再推进）**：
- **R-B1 凭据列不落 SELECT（安全红线·最高·✅ 探针已验投影有性）**：探针实测 `select(['id','name','email'])` 生成 `select "u0"."id","u0"."name","u0"."email"`——SQL 面根本不含 `password`（非取回后删）；**但缺省不投影时 QB 用 `select "u0".*`（SQL 文本不含 password 字样但运行时会取回）→ 投影必做**·无第二条路。
- **R-B2 大小写不敏感搜索语义（✅ 已由 scratch 探针结清·2026-10-16）**：探针（`mikro_b_probe`·应用 Drizzle 权威 SQL·合成 4 行含 `%weird%`/`under_score`/大写）实测 Mikro `$ilike` 生成 `"name" ilike '%term%'`·与 Drizzle `ilike` 真身（PG 原生 ILIKE）**命中集 6/6 逐字节一致**（`ann`/`BOB`/`%`/`_`/`smith`/`no-match`）——因 Drizzle 生产侧 `'%${search}%'` 本就未转义通配符·`$ilike` 连这同一行为 1:1 复刻。**定案＝采 `$ilike`（忠实 drop-in·无偏差需登记）**；`$re`（生成 `~*` 正则）在 `%`/`_` 上漂移→**弃**。（本探针为一次性取证·已 DROP·零仓库代码变更。）
- **R-B3 FK cascade 语义**：`destroy` 采 `nativeDelete`（DB 层 cascade）·非 `em.remove`；断言不逐表删、不预查（对齐既有测 `select not called`）。
- **R-B4 状态缺省归一**：`effectiveStatus(metadata) ?? ACTIVE`、`user_status` 缺行→`ACTIVE`·与 `canTransition`/deny-list 同口径。
- **R-B5 排序/分页**：`createdAt DESC`（`QueryOrder.DESC`）·`findAndCount` 的 total 不受 order/limit 影响·`createPage` 同形。
- **R-B6 deleted 终态可导**：导出四段查询**不加 status 过滤**（取证用途·NFR-6）。

**高危面订正（如实上报·不 overclaim）**：本批**不触迁移实体 / schema / DDL / 迁移链 / 真库**——§5.11/§3 曾笼统标「3c-ii 全程触高危 1」，对 **B 不成立**（高危 1 的「实体保真」指迁移基线漂移·B 不产 DDL·DDL 恒等闸与本批正交·不受影响）。B 的真实风险面为：① **数据安全**（R-B1 凭据列排除·泄漏即合规事故）；② **破坏性写路径切换**（`destroy` 运营硬删·谓词/cascade 若错则误删行）；③ **平台运营读语义漂移**（搜索/状态归一/分页/导出六段·影响经营者视图与 NFR-6 可携）。①②属高危（涉凭据面 + 破坏性删除）·**仍须人明示签核**·Agent 不自行执行。

**实现序**（每步验证后再下一步）：（i）scratch 真库探 R-B2 搜索运算符 + R-B1 `fields` 投影不取回凭据列·（ii）落 `MikroUserGovernanceRepository`（较简·先立范式）+ 镜像隔离测·（iii）落 `MikroTenantGovernanceRepository`（含 export 六段 + destroy）+ 镜像测·（iv）`tenants.module.ts` 两 useClass 改指 Mikro（旧类不删）·（v）默认 ci 基线不动 + 表所有权守卫复绿（`nativeDelete(Organization)` 落 tenants ctx·预判合规无新例外）+ gated 真库 e2e（platform 治理/导出/硬删走 Mikro 往返·若有）+ build + prod-boot。

**测试策略**：镜像既有 `drizzle-*-governance.repository.test.ts` 的**非弱化**断言（tenant-gov ~9 例 + user-gov 3 例）——以 fake em（`findAndCount`/`findOne`/`find`/`count`/`nativeDelete`）替 fluent-chain；覆盖：search 谓词构造、`fields` 投影排除凭据（R-B1 红线测）、六段导出组装 + nested 最小身份面、deleted 可导、未知租户单查短路不触他表、`nativeDelete` 主行删（不逐表·不预查）+ 幂等 false、status 缺省归一、分页 total。**诚实面**：与 A 同——governance 读/硬删无专属真库 e2e 者以 mock 单测 + DI + scratch 探针间接背书·如实登记不夹带硬造 e2e。

**回滚点**：`TENANT_GOVERNANCE_REPOSITORY`/`USER_GOVERNANCE_REPOSITORY` useClass 改指 Mikro·旧 Drizzle 类不删（切片 4 才清）；命令/查询处理器无独立类者＝`git revert` 单点 commit。与 §5.6 迁移基线正交。

**归人裁点（本批审计门）**：① **是否开工 3c-ii-B**（触 R-B1 凭据面 + R-B2 破坏性 `destroy`·明示签核方可实现）——待人据下方探针取证结果终裁；② ~~R-B2 搜索语义无法逐字节对齐时采近似还是停下~~ **✅ 已被探针结清**（`$ilike` 与 `ilike` 6/6 逐字节一致·无需采近似也无偏差需登记）；③ **无专属真库 e2e 的 governance 写面（export/destroy）是否补一条 gated 真库 e2e 作前置**——人裁＝**不强制（沿 3c-ii-A 口径·mock 单测 + DI + scratch 探针间接背书·诚实登记未覆盖面）**。

**探针取证结论（2026-10-16·人裁「先跑探针取证再裁」）**：一次性 scratch 探针（`mikro_b_probe`·应用 Drizzle 权威 SQL·已 DROP·零仓库代码变更）已钉死 R-B1/R-B2 两事实——**均有利**：`$ilike` 忠实 drop-in（6/6 逐字节一致）+ `fields`/select 投影在 SQL 面排除凭据列（但缺省 `.*` 会取回→投影必做）。技术风险面已消解至“按方案 R-B1 强制投影 + R-B2 用 `$ilike`”即可保真·开工与否的障碍仅剩高危 ①②（凭据面 + 破坏性硬删）的**责任签核**（归人 P2）。

### §5.14 切片 3c-ii-B 实现记录（治理读面整片搬 · 已落地 · 人签核开工）

**范围**：两处平台级治理读面 token 的 `useClass` 由 Drizzle 改指 Mikro（expand 双轨·旧 `Drizzle{Tenant,User}GovernanceRepository` 类与单测**不删**作回滚点）——`TENANT_GOVERNANCE_REPOSITORY`→`MikroTenantGovernanceRepository`（list/findById/diagnostics/exportTenantData/destroy）·`USER_GOVERNANCE_REPOSITORY`→`MikroUserGovernanceRepository`（list）。`TENANT_PROVISIONING_REPOSITORY` 不在 B 范围·仍 Drizzle。

**落地文件**：`mikro-user-governance.repository.ts`（73 行）·`mikro-tenant-governance.repository.ts`·两镜像隔离单测（`mikro-{user,tenant}-governance.repository.test.ts`·共 19 例·非弱化对齐各自 Drizzle 测）·`tenants.module.ts`（两 useClass 改指·移除旧治理类 import· provisioning import 保留）。

**实现期钉死的三处关键事实（补 §5.13 未尽）**：
- **实体类型形态**：`entities.ts` 的 BA 七表走 `defineEntity`·**无 companion interface**→实例类型须经 Mikro 导出的 `InferEntity<typeof Organization>` 提取（`User`/`Organization` 直接作类型报 TS2749）；四表/Post 有 companion interface 不受影响。
- **成员名册对齐 innerJoin**：Drizzle 用 `innerJoin(user)` 丢弃无匹配 user 的 member→Mikro 以「批量取 user + `flatMap` 过滤 `usersById` 缺失项」严格复刻（非全取兜空串）·FK→user cascade 使孤儿结构上不存在、此为读面行为对齐。
- **`handle` 类型**：Drizzle schema `handle` 为 `NOT NULL DEFAULT ''`（Mikro 侧仅为 BA authFlow 测试面声明可空·真实列非空）→`?? ''` 系类型层兜底、运行期不触发·port `ExportedTenantUser.handle: string` 得满足。

**保真闸落地**：R-B1 export 的 user 侧 `fields:['id','name','email','handle']` 投影（测以「fake user 携 password 亦不入 payload」钉死凭据红线）·R-B2 搜索 `$ilike`（探针结清）·R-B3 `destroy` 走 `nativeDelete(Organization,{id})`（纯 SQL·五子表 FK cascade·不 `em.remove`）·R-B4 `effectiveStatus` 缺省归一 active·R-B5 `findAndCount` total 不受 order/limit 影响·R-B6 export 四段查询不加 status 过滤（deleted 可导）。

**验收（实机·2026-10-16）**：tsc 0·Biome check 0（变更文件·改口 `flatMap` 去 non-null 断言）·**默认 `ci` 384 passed \| 16 skipped (400)**（既有 365 全绿 + 新 19 镜像测·基线不回归·gated e2e 仍 skipped）·表所有权守卫 3/3（`nativeDelete(Organization)` 归 tenants ctx 合规·正则实识该形态非漏检）·`pnpm run ci` 全链 PASSED（build 含）·`verify:prod-boot` /health 200（切 Mikro 后 DI 解析成功）。fallow 缺 linux-x64-gnu·advisory-only（§4.7）。

**高危执行面**：本批落地触高危 ①（export 凭据面·已由 fields 投影 + 红线测消解）+ ②（`destroy` 破坏性硬删·已由人明示签核）·**未触迁移实体/schema/DDL/迁移链/真库**（恒等闸正交·未对真库应用任何迁移）·未删依赖·未改 `docs/specs`/门禁。

**诚实面（不得 overclaim）**：两 Mikro 治理读面无专属 gated 真库 e2e（沿 3c-ii-A 口径·人裁不强制新 e2e）——覆盖面为镜像单测 + DI 接线 + prod-boot·真库复合查询/ILIKE/FK cascade 的运行时行为依赖 §5.13 探针取证与既有 Drizzle→Mikro 操作形态映射而非本批实库往返。**3c-ii-C（EventStore 归属切片 4）未开工**。


---

## 6. 完成判据（可核验 + 穷尽）

本稿自身（起草片）：

- [ ] 索引表新行登记为「待审计 · 未开工」（状态单源·文档头不重复标）；
- [ ] `external-borrowing-backlog.md` V4 行回写「B 案已起草待二判」指针；
- [ ] 零代码 / 零依赖 / 零 `docs/specs` 变更实证：`git show --stat` 仅触及 `docs/plans/` 两处 + `docs/research/` 一处；`pnpm run ci` 基线 **358 不动**。

（实施片判据内联于 §3 各切片；全案总判 = 所取切片各自 [x] + 宪法/入口/索引三层口径一致 + `pnpm run ci` 绿 + `verify:prod-boot` /health 200 + 真库 migrate/seed 往返——仅在 Q1 裁「修」后生效。）

## 7. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-16 | 0.1.0 | 人裁「③两者都做」中之一：出 B 修宪案 | 首版候选稿：以勘察 v0.2 为唯一事实输入，立 0–5 六切片（证据补拍 / 自持 adapter / expand / BA 切换 / contract+修宪 / 可选叠甲）、R1–R6 对策表、Q1–Q4 归人裁决点；顺带把案名由勘察预留的 `tooling-mikro-orm` 订正为 `global-orm-mikro-constitution-amendment`（本仓 `global-*` = 全局修宪命名惯例） |
| 2026-10-16 | 0.2.0 | 人裁 Q1＝v7+自持 adapter（chat selection）→ 据裁执行切片 0 证据补拍 | §5 记 Q1 裁示；§5.1 回填 Node 22+pnpm isolated+真 PG 15 重测账（R1 消解·迁移链经 `migrator.up()` 绿但拓出 v7 API 换形/protected 静默空跑·实体 DSL 漂移·UoW/Identity Map 绿·R2 桥法给绿·BA 接链坑·全绿存照）；**诚实声明未覆盖面**（organization/genericOAuth/additionalFields/quota/test-utils 未跑，R4 尚未结清）·零仓库依赖变更 |
| 2026-10-16 | 0.2.1 | 人选 Q2/Q3/Q4·「你帮我裁定」（人授意按建议自裁·同 V5 口径） | §5 将 Q2/Q3/Q4 由归人未决改为已裁并附由：Q2＝零装饰器 + S9 实体面豁免声明（装饰器线落选）·Q3＝Filters/RLS 暂不采纳（隔离唯一 SSOT 保留现仓储卡点·切片 5 不执行）·Q4＝不引入 Kysely（逃生走 `em.execute`/QueryBuilder）；§3 切片 5 同步标 Q3/Q4 已裁＝不做；仍留两项子项（夹具口径·一致性套件是否入硬门禁）归人 |
| 2026-10-16 | 0.3.0 | 人裁「补拍 R4 面」（AskUserQuestion 选项①）·切片 0 结清取证 | §5.1 追加「切片 0 补拍 · R4 面」：organization 三实体真行 + activeOrganizationId + 邀请（psql 坐实·绿）·additionalFields 往返（绿）·quota 原生 `incrementOne/consumeOne` 原子路径（绿）·test-utils **authFlow 8/8 全绿**（含单用 token 的密码重置·抓出 `consumeOne` 须返行快照的常规坑）·normal 15/108（失败系本仓无的合成模型 scope 不匹配·非缺陷·订正 LIKE 转义误判）；直查 @better-auth/core 1.7.7 补全 raw adapter 契约（update 键·connector 大写·supportsDates/Booleans/JSON·consumeOne/incrementOne 返行快照·transaction 内 nativeDelete·harness 动态重建 adapter）；**genericOAuth 完整外部回调 dance 与 normal 的 join/arrays/json 能力仍未覆盖（不得 overclaim）**；给出 Agent 判读建议（整案 GO 技术依据已具备·**非裁定**·GO/NO-GO 与门禁归人）·scratch `mikro_spike_r4` 已 DROP·/tmp 已删·零仓库依赖变更 |
| 2026-10-16 | 0.4.0 | 人裁「同意·继续·你帮我裁定」（人授意按建议自裁·同 Q2/Q3/Q4。V5 口径） | 三个归人裁决点成文：**整案审计门裁定＝GO**（技术依据已具备·见 §5 结论·实施逐片仍须高危签核）·**一致性套件**：authFlow 钉为切片 1 强制验收判据（EXIT=0），并入 `ci` 硬门禁链触清单 3、待切片 1 随实现签核后再接（本阶段不改 `scripts/ci.ts`）·**切片 0 夹具口径＝追认为惯例**；文档头/§5 前言由「待审计」改「已审计·整案 GO」·§3 切片 1 补入 R4 实测契约钉点（consumeOne/incrementOne 返行快照·update 键·connector 大写·supports* 置真·transaction nativeDelete）与开工前置（清单 2+3 待人签核）·零代码零依赖变更·ci 基线 358 不动 |
| 2026-10-16 | 0.5.0 | 人签核开工切片 1·「同意·继续·你帮我裁定」（Agent 照建议代裁留痕·问责归人 P2） | **切片 1 落地**（本仓真实源码位·非 /tmp spike）：`apps/api/src/database/mikro/{entities,orm,mikro-auth-adapter}.ts`（7 实体零装饰器 defineEntity + EntityCaseNamingStrategy + PostgreSqlMikroORM + 自持 v7 adapter：createAdapterFactory·8 必选 + consumeOne/incrementOne/createSchema + transaction·per-op fork + ALS 事务透传·em.execute 原生 SQL·consumeOne 走 DELETE…RETURNING 单语句原子返行快照）；**对 pinpoint③ 的 raw 形态取反**（supportsDates:false 因 em.execute 回 timestamptz 为字符串·由 factory 代劳 Date↔ISO）；验收套件 env-gated（`auth-adapter.consistency.spec.ts` + 专用 `vitest.consistency.config.ts` + `pnpm run test:auth-consistency`）：**authFlow in-repo 8/8 + evidence 真行×3 → 9/9·EXIT=0**（scratch 库 `mikro_ba_consistency` 毕即 DROP）·默认 `ci` 基线 358 不动（spec 不被默认 include 收集）·`pnpm run ci` 全链 PASSED。**未接入 `scripts/ci.ts` 硬门禁链**（触清单 3·待人签核后另接）·未动生产装配·未改 `docs/specs`。§3 切片 1 标完成态 + 新增 §5.2 实现记录 | 
| 2026-10-16 | 0.5.1 | 人裁「同意」（起草门禁接入方案）→ AskUserQuestion 签核路线 A + 安全前置 | **切片 1 门禁接入（路线 A·最小侵入）**：新增 `pnpm run ci:db`（= `check→test→test:auth-consistency`）为独立可选 DB 门禁·**默认 `ci`/`ci:quick`/pre-push 零改动**；spec 新增 `assertScratchDb` 安全前置（`drop()` 前断言库名恒等 scratch·防 `DATABASE_URL` 误指主库时 DROP 真实库·可经 `MIKRO_CONSISTENCY_DB` 显式换名）·抽出 `resetScratchSchema` 共用。实机：外来库 `guard_probe` 被拒且表存活·`ci:db` EXIT=0（358+9/9）。路线 B/C本次未采（C=「全栈 CI 拼 PG」专项挂账）。未动生产装配·未改 `docs/specs` | 
| 2026-10-16 | 0.6.0 | 人签核开工切片 2「1」（Agent 照建议代裁留痕·问责归人 P2） | **切片 2 落地（expand 双轨·定名＝`posts`·纯增量·未触高危清单 1/2/3/4）**：新增 `database/mikro/{post.entity,mikro-orm.service,mikro-orm.module}.ts` + `modules/posts/infrastructure/repositories/mikro-post.repository.ts`（零装饰器 defineEntity + companion interface · EntityCaseNamingStrategy 对齐物理 camelCase 列 · 懒建保 DB-free · @Global 装配根 · 实现 PostRepository port 读写全走 em · 隔离卡点 fail-closed 先于取 em）；改 `orm.ts`（initMikroOrm 加 entities 形参）/ `posts.module.ts`（POST_REPOSITORY 唯一改绑 Mikro）/ `app.module.ts`（imports 加 MikroOrmModule）；`DrizzlePostRepository` 类与其单测不删不改（双轨/回滚点）；新增 `mikro-post.repository.test.ts`（11 例镜像隔离律）。验收实机：build TSC 0·Biome 0·test **353 passed | 16 skipped (369)**（基线 358+11·既有 Drizzle 测不改仍绿）·env-gated `tenant-isolation.e2e` 真库 **5/5 EXIT=0**（证读写全走 Mikro）。§3 切片 2 标完成态 + 新增 §5.3 实现记录（触面清单 + 回滚点成文）。未动生产其它装配·未删旧·未改 `docs/specs`·未改门禁 |
| 2026-10-16 | 0.7.0-draft | 人「同意」→ 起草切片 3 开工方案供签核（**未执行**） | **新增 §5.4「切片 3 开工方案草案（拟·待签核·未执行）」**：直查钉死现状（BA 数据面单一切换点 `auth.implement.ts:90`·自持 adapter 已就绪需函数形态·Mikro 实体缺 `consent/workspace/user_status/tenant_subscription/event`·Mikro 侧无 `migrations`/`Migrator`/baseline·app 侧 Drizzle 触面 26 文件）；拟子切片 3a（迁移链交接·高危 1·scratch 对拍 + 基线标记幂等法）/ 3b（BA adapter 接链单点切换 + 一致性套件与全量 gated e2e 验收）/ 3c（app 侧 BA-table 仓储分批切·沿切片 2 律）；列归人裁点（本阶段范围 3a+3b vs 含 3c · 迁移基线法是否采 · 3a 真库一次性签核）。**零代码零迁移·未动任何生产装配**·未改 `docs/specs`·未改门禁 |
| 2026-10-16 | 0.8.0 | 人签核切片 3 范围「仅 3a」·基线法「你来裁定·多租户优先」（AskUserQuestion） | **切片 3a 落地（迁移链交接·纯新增·未触真库/生产装配）**：执行中发现架构叉——有损 BA/Post 实体不可直接作迁移基线（会静默 DROP FK/index/`role` 列）→ 停下上报归人（P2）→ Agent 裁定采**用途分离·忠实全模型**：新增 `database/mikro/migration/{migration-entities,mikro-migration.config}.ts`（13 表忠实实体·`p.manyToOne.mapToPk().deleteRule()` 发 FK·迁移装配独立于 `orm.ts`/app boot·`extensions:[Migrator]`+`snapshotName`）+ 生成 `migrations/Migration<ts>.ts`+`mikro-migrations.json` + `scripts/mikro-migration-baseline.ts` 离线对拍工具。验收：scratch 库与 Drizzle 现 schema 结构级逐表对拍 **13/13 PASS·零漂移**（含 FK 删/改规则·index/unique·enum·可空/默认）·类型映射实测钉死（`.columnType('timestamp')`压回无 tz·`p.text()` 非 varchar 等）。`entities.ts`/`post.entity.ts`/`orm.ts` **零改动**→默认 `ci` 基线 353/369 不动·`pnpm run ci` PASSED·两 scratch 库毕即 DROP。**未做**：未对真库应用 init 迁移（高危 1·待人一次性签核）·未含 3b/3c·未删依赖·未改 `docs/specs`/门禁。§3 切片 3 标部分落地 + 新增 §5.5 实现记录 |
| 2026-10-16 | 0.8.1 | 人一次性明示签核真库基线登记「整链：预检+登记」（AskUserQuestion·高危清单 1） | **切片 3a 真库基线登记已执行**（§5.6）：受控脚本 `scripts/mikro-baseline-apply.ts`（目标库名护栏 + `pg_dump` 安全网 + 只读 `checkSchema` 预检 + 单条 `logMigration`）。对常驻 dev 库 `nestjs_practice`：`checkSchema=false`（无漂移）→ `logMigration('Migration20261016055354')`·`getExecuted` 含该条·`getPending` 空·**13 表行数前后完全不变**（仅新增 `mikro_migrations` 一张记账表·零数据表 DDL·EXIT=0）；回滚 `unlogMigration`/`drop table mikro_migrations`。`nestjs_practice` 纳入 Mikro 迁移链·`drizzle/` 冻结。**未含 3b/3c**（BA 接链运行时仍 `drizzleAdapter`·app 侧仓储未切）·未删依赖·未改 `docs/specs`/门禁 |
| 2026-10-16 | 0.9.0-draft | 人「同意」→ 起草切片 3b 开工方案供签核（**未执行**） | **新增 §5.7「切片 3b 开工方案（拟·待签核·未执行）」**：直查钉死现状（单一切换点 `auth.implement.ts:90` 由 `drizzleAdapter(drizzleService.db,{provider,schema})`→`mikroAuthAdapter(orm)`·适配器已就绪需 `MikroORM` 实例·`MikroOrmService` 现仅暴露 `fork()` 需加取 orm 出口·`MIKRO_APP_ENTITIES=[Post]` 不足以覆盖 BA 需并入 `MIKRO_ENTITIES` 7 表·`auth.bootstrap.ts:46` 需值注入）；列 5 项归人裁点（双轨旗标 vs 直切·实体集并入 vs 独立 orm·orm 出口形态·验收口径含一致性套件是否强制/gated e2e 范围/genericOAuth 仍未起 IdP·开工签核）+ 触面清单/回滚点/风险。**零代码零迁移·未动任何生产装配**·未改 `docs/specs`/门禁·真库基线（§5.6）不受影响（适配器选择与迁移基线正交） |
| 2026-10-16 | 0.9.1-draft | 人「你裁定就行」→ §5.7 五归人裁点 Agent 代裁留痕（照建议自裁·问责归人 P2·**未开工**） | §5.7 追加「Agent 代裁」块：裁点1 采 env 旗标 `BA_ADAPTER=mikro|drizzle`（免重部署回滚·drizzle 路径+schema import 留至切片 4）；裁点2 并入单一 app-orm（`MIKRO_APP_ENTITIES=[Post,...MIKRO_ENTITIES]`·不建独立 BA-orm·懒建保 DB-free）；裁点3 `createAuthAdapter():Promise<factory>` 不泄 orm/em·`CreateAuth` 转 async；裁点4 一致性套件续 env-gated 不入默认 ci（本片跑一次 EXIT=0）+ gated 真库 e2e 全链 EXIT=0 + `verify:prod-boot` 200 + 基线 353/369 不动 + genericOAuth 仍不起 IdP 不强验；裁点5 **仅裁定方案取值·非开工授权**·改生产 auth 装配仍待人明示签核。**零代码零迁移·未动生产装配**·未改 `docs/specs`/门禁 |
| 2026-10-16 | 0.10.0 | 人「签核开工·照裁定实现」（AskUserQuestion）→ 实现切片 3b（非草案落地） | **切片 3b 落地（BA 数据面接链单点切换·未触高危 1/2/3/4）**：`MIKRO_APP_ENTITIES=[Post,...MIKRO_ENTITIES]`（BA 7 表并入单一 app-orm）+ `MikroOrmService.createAuthAdapter()`（不泄 orm/em）+ `CreateAuth` 转 async + `BA_ADAPTER` 双轨旗标（缺省 drizzle·`auth.implement.ts` 单点择适配器·`drizzleAdapter`+`schema` import 不删）+ `auth.bootstrap.ts` 值注入 MikroOrmService（S9）·`auth.module.ts`/schema/依赖/门禁/`docs/specs` 零改·两单测补 async+形参占位。验收：tsc 0·check 0·默认 `ci` 353/369 基线不动·一致性 9/9 EXIT=0·gated e2e `BA_ADAPTER=mikro` auth-http-surface 3/3 + tenant-isolation 5/5 + seat-quota 1/1 全绿·prod-boot 双轨 200（mikro 轨坐实并入实体集建连）。**发现相邻既有缺陷 `tenant-hard-delete.e2e`**（裸 `ref.init()` 无 HTTP adapter·`AuthBootstrapService.onApplicationBootstrap` 必抛）→ 三重取证（mikro=drizzle 同失败 + stash 回 HEAD 同失败）坐实非本片引入·归 module-auth-http-surface 遗留 harness·**另案登记不越界夹带**。新增 §5.8 实现记录·§3 切片 3 标 3b 落地·未删旧/未改宪法/门禁·真库基线（§5.6）正交不受影响 |
| 2026-10-16 | 0.11.0-draft | 人「同意，继续」→ 起草切片 3c 开工方案供签核（**未执行**） | **新增 §5.9「切片 3c 开工方案（拟·待签核·未执行）」**：Grep 全量非测试态直查钉死 app 侧**非-BA Drizzle 触面 9 处**（platform-identity/tenant-status/suspend-user 走已有 BA 实体·quota/user-status/user-governance/workspace/event-store/tenant-governance 需补实体）；**核心发现**：`workspace`/`user_status`/`event`/`tenant_subscription` 四表**无运行时 Mikro 实体**（仅 `migration-entities.ts` 13 表忠实实体作迁移基线）→3c 切这些仓储必先补实体·**撞上切片 4「合并单一 SSOT」议题**且触发已知高危坑（有损实体作基线静默 DROP）。列 6 项归人裁点（首要=范围/排序岔口 a/b/c·推荐 a「先易后难」：3c-i 只切已有实体覆盖的仓储·3c-ii 连同切片 4 SSOT 合并；补实体保真律·tenant-governance 复杂查询整/缓搬·EventStore 归属·分批粒度·开工签核）+ 触面清单/回滚点/风险。**零代码零迁移·未动任何生产装配**·未改 `docs/specs`/门禁·未选定分支 |
| 2026-10-16 | 0.12.0 | 人裁（AskUserQuestion）：3c 范围＝**B**（内含全部补实体·SSOT 合并提前到 3c-ii）+ 开工签核＝**实现 3c-i** | **切片 3c-i 落地（3 处已有实体覆盖仓储·零补实体·未触高危 1/2/3/4）**：新增 `MikroPlatformIdentityLookup`（读 BA `User`.email）/ `MikroTenantStatusStore`（读写 BA `Organization`.metadata+updatedAt·save 走 `nativeUpdate`）·`tenancy.module.ts` 将 `TENANT_STATUS_STORE`/`PLATFORM_IDENTITY_LOOKUP` 两个 useClass 改指 Mikro（旧 Drizzle 类不删作双轨/回滚点）·`suspend-user.command-handler.ts` 注入由 DrizzleService→MikroOrmService·session 硬删改 `em.nativeDelete(Session,{userId})`·同步其单测协作者（非弱化）。**发现表所有权守卫为 Drizzle-only grep·Mikro `nativeX(Entity)` 会令跨写静默漏检→按机制修复增强探测为 ORM 无关**（兼识 nativeInsert/Update/Delete·实体 PascalCase 首字母小写⇄schema 键·例外不陈旧·不丢覆盖面）。验收：tsc 0·check 0·默认 ci 353/369 基线不动·表所有权守卫 3/3·gated e2e `BA_ADAPTER=mikro` auth-http-surface 3/3 + tenant-isolation 5/5 + seat-quota 1/1 全绿·build TSC 0·prod-boot 双轨 200（drizzle 轨无 Mikro 连接·DB-free 守住）。**诚实面**：emailOf/suspend 无专属真库 e2e（仅单测+DI）。**3c-ii（四表补实体+剩 6 仓储·触高危 1）未开工·待另立签核**。新增 §5.10 实现记录·schema/依赖/门禁/`docs/specs` 零改·真库基线（§5.6）正交 | 
| 2026-10-16 | 0.13.0-draft | 人「起草 3c-ii 开工方案」（AskUserQuestion）→ 零代码勘察 + 拟 §5.11供签核（**未执行**） | **新增 §5.11「切片 3c-ii 开工方案（拟·待签核·未执行）」**：直查 `migration-entities.ts` 勘定**四表（workspace/user_status/tenant_subscription/event）均已忠实建模**（含 FK cascade/复合 index/unique/PK-FK 特殊构造）→补实体＝提升/派生非新建；**但不可直接 import 那四对象进 app-orm**（migration 集用 `mapToPk` 引其自带 User/Org/Workspace·与 `entities.ts` 扁平 BA 实体同表→`MikroORM.init` 注册冲突·此即「单一 SSOT」真实难点）。列 4 归人裁点：① SSOT 合并策略 α扁平孪生（推荐·双描述暂留）/β反向单一源（爆炸半径最大·不动）/γ抽列元数据（风险最高）；② 复杂 read-model（tenant-governance 跨 6 表 join+原生 count+ilike+分页、user-governance LEFT JOIN）折中/整搬/缓搬；③ EventStore 归属（推荐留切片 4）；④ 分批 3c-ii-A（补实体+CRUD 仓储）/B（read-model）/C（EventStore）。钉死 6 仓储+2 store+event-store 操作形态（ALS 租户卡点/`em.upsert`/bigint autoincrement PK/平台级天然全量/凭据列排除）。**全程触高危 1·未选定策略·零代码零迁移·未动任何生产装配·未补实体**·未改 `docs/specs`/门禁 | 
| 2026-10-16 | 0.13.0 | 人裁（AskUserQuestion 定案）：① SSOT＝**γ 抽列元数据单一源** + ② read-model＝整片搬（归 B）+ ③ 首批签核＝**实现 3c-ii-A** → 落地 3c-ii-A（非草案） | **切片 3c-ii-A 落地（γ·四表补实体 + 切 4 CRUD·触高危 1）**：新增 `database/mikro/{column-meta,four-tables}.ts`（四表列元数据**单一真相源** + `buildMigrationEntity`/`buildRuntimeEntity` 两变体工厂·消双描述·BA 七表/Post 不重构）·`migration-entities.ts` 四表旧手写改工厂消费·`post.entity.ts` 并入 `MIKRO_FOUR_TABLE_ENTITIES`·新增 4 适配器（`mikro-workspace/subscription.repository` ALS 租户卡点 fail-closed·`mikro-quota/user-status.store` 非 ALS）+ 3 模块 useClass 改指 Mikro（旧 Drizzle 类不删作回滚点）+ 2 镜像隔离单测。**新建 DDL 恒等闸 `scripts/mikro-ddl-identity.ts`+golden**（旧 `mikro-migration-baseline.ts` 因已提交迁移不能 `createInitial`→改 `getUpdateSchemaSQL` 归一 golden 自比对）·**工厂重建后 check 24/24 逐行 PASS**（差异仅 FK 命名噪声·证基线 `Migration20261016055354` 仍有效·迁移链零动·未对真库应用迁移）。验收：tsc 0·check 0·**默认 ci 365 passed \| 16 skipped (381)**（既有 353 全绿·新 12 双轨隔离测）·表所有权守卫 3/3·build TSC 0/SWC 169·prod-boot 200（懒建未触发·DB-free 守住）·gated 真库 e2e（scratch `nestjs_e2e` push）seat-quota 1/1坐实 MikroQuotaStore + tenant-isolation 5/5 + event-store 5/5 全绿·tenant-hard-delete 既有 harness 缺陷经 stash 回退复现同错坐实非本片引入。**诚实面**：workspace/subscription/user-status 三 Mikro 适配无专属真库 e2e（仅 mock 单测+DI）·read-model 整片搬归 3c-ii-B·EventStore 未切。**未做真库 schema 迁移·未删依赖·未改 `docs/specs`/门禁**·真库基线（§5.6）正交。新增 §5.12 实现记录 | 
| 2026-10-16 | 0.13.1-draft | 人裁（AskUserQuestion）：下一批＝**3c-ii-B**·流程＝**先方案后实现** → 零代码起草 §5.13 供审计门（**未执行**） | **新增 §5.13「切片 3c-ii-B 开工方案（拟·待签核·未执行）」**：直查勘定治理读面所需 **8 实体均已存在 Mikro 运行时定义**（Organization/Member/Invitation/User + Workspace/TenantSubscription/UserStatus + Post）→**B 无需补任何实体**；逐方法钉 Drizzle→Mikro 操作形态映射（`findAndCount`+orderBy/limit/offset·`count`×4·`findOne` PK 裸串·export 六段 find + **`fields` 投影 SQL 层排除凭据列**·user-gov LEFT JOIN 以二次批量取状态+内存合并折叠不 N+1·`nativeDelete(Organization)` 靠 DB FK cascade 非 `em.remove`）；立 6 不可协量保真闸（R-B1 凭据列不落 SELECT 安全红线·R-B2 ilike→`$ilike`/`$re` 实机探针不得静默退化大小写敏感·R-B3 FK cascade·R-B4 状态缺省归一·R-B5 排序/分页 total·R-B6 deleted 可导）；**高危面订正**：B **不触迁移实体/schema/DDL/迁移链/真库**（§5.11 笼统标高危 1 对 B 不成立·恒等闸正交），真实风险＝①数据安全（凭据面）+②破坏性硬删（`destroy`）+③运营读语义漂移·①②仍属高危须人签核。列 3 归人裁点（是否开工·搜索语义不对齐时采近似还是停下·是否要求补 gated 真库 e2e）。**零代码零迁移·未动任何生产装配·未改 `docs/specs`/门禁** |
| 2026-10-16 | 0.13.2-draft | 人裁（AskUserQuestion）：开工签核＝**先跑探针取证再裁**·R-B2 偏差处置＝采近似+登记·真库 e2e＝不强制（沿 A 口径） | **一次性 scratch 探针取证（`mikro_b_probe`·已 DROP·零仓库代码变更）钉死 R-B1/R-B2**：Mikro `$ilike` 生成 `ilike '%term%'` 与 Drizzle `ilike` 真身（PG 原生 ILIKE）**命中集 6/6 逐字节一致**（含 `%`/`_`/大写/无匹配）→**定案 `$ilike`（忠实 drop-in·无偏差需登记·`$re` 漂移弃）**；`fields`/select 投影实测 SQL 面不含 `password`（但缺省 QB `select .*` 运行时会取回→**投影必做**）——均有利。§5.13 回写探针结论·裁点② 标已被探针结清·裁点③ 标不强制新 e2e。**仍未开工**（高危①凭据面+②破坏性硬删的责任签核归人·障碍只剩此） |
| 2026-10-16 | 0.13.3 | 人终裁（AskUserQuestion）＝**签核开工·按 §5.13 实现**（含 export/destroy 高危面）→ 落地 3c-ii-B（非草案） | **切片 3c-ii-B 落地（治理读面整片搬·expand 双轨·触高危 ①②）**：`TENANT_GOVERNANCE_REPOSITORY`/`USER_GOVERNANCE_REPOSITORY` 两 useClass 改指 `MikroTenantGovernanceRepository`（list/findById/diagnostics/exportTenantData/destroy）/`MikroUserGovernanceRepository`（list）·旧 Drizzle 类不删作回滚点·`TENANT_PROVISIONING_REPOSITORY` 不动。实现期钉死三事（补 §5.13）：BA 七表 `defineEntity` 无 companion interface→实例类型走 `InferEntity<typeof …>`；export 成员名册以 `flatMap` 过滤对齐 Drizzle `innerJoin(user)` 语义；`handle` 真实列 NOT NULL→`?? ''` 仅类型层兜底。保真闸均落地（R-B1 fields 投影排除凭据 + 红线测·R-B2 `$ilike`·R-B3 `nativeDelete(Organization)` FK cascade·R-B4 缺省 active·R-B5 total·R-B6 deleted 可导）。验收：tsc 0·check 0·**默认 ci 384 passed \| 16 skipped (400)**（既有 365 全绿 + 新 19 镜像测·基线不回归）·表所有权守卫 3/3·`pnpm run ci` PASSED·prod-boot /health 200。**未触迁移/schema/DDL/迁移链/真库**·未删依赖·未改 `docs/specs`/门禁。**诚实面**：两 Mikro 读面无专属 gated 真库 e2e（沿 A 口径）。新增 §5.14 实现记录·3c-ii-C（EventStore）未开工 |

---

<!-- 变更戳 -->
正文已于 2026-10-16 / v0.13.3 变更（**上接 3c-i 已落地（§5.10）· 3c-ii-A 已落地（§5.12）· 3c-ii-B 已落地（§5.14）**·人签核开工 3c-ii-B：两处平台治理读面 `TENANT_GOVERNANCE_REPOSITORY`/`USER_GOVERNANCE_REPOSITORY` useClass 改指 Mikro（list/findById/diagnostics/exportTenantData/destroy + user list）·双轨不删旧·R-B1 fields 投影排除凭据 + R-B2 `$ilike`（探针结清）+ R-B3 `nativeDelete(Organization)` FK cascade均落地·**未触迁移/schema/DDL/迁移链/真库**·默认 ci 384 passed \| 16 skipped (400)（基线 365 不回归 + 19 镜像测）·prod-boot 200。剩 3c-ii-C（EventStore·归属切片 4）未开工。**上接：**·人裁 γ（抽列元数据单一源）+ 签核首批 3c-ii-A：四表列元数据单一源 `four-tables.ts`/工厂 `column-meta.ts`·`migration-entities.ts` 四表旧手写改工厂消费·运行时实体并入 `MIKRO_APP_ENTITIES`·切 4 CRUD（workspace/subscription 仓储·quota/user-status store）双轨不删旧·新建 DDL 恒等闸证工厂重建后 24/24 逐行 PASS（高危 1 消解·迁移链零动）。剩 3c-ii-B（read-model 整片搬·开工方案已起草 §5.13·**已于 v0.13.3 落地 §5.14**）+ 3c-ii-C（EventStore）未开工。**上接：** **切片 1 已落地 + 门禁接入已人签核路线 A + 切片 2 已落地（expand 双轨·定名＝`posts`）+ 切片 3a 已落地（迁移链交接·基线法 Agent 代裁·多租户优先）**：自持 v7 adapter + 零装饰器实体 + EntityCaseNamingStrategy + raw `em.execute` 寻址；验收 authFlow in-repo 8/8 EXIT=0 + 真行×3 存照；`supportsDates:false` 为 raw 形态对 pinpoint③ 的取反；独立 `pnpm run ci:db`（未劫持默认 `ci`/pre-push）+ `assertScratchDb` scratch 库名断言安全前置；**切片 2**：`posts` 数据面单点改绑 `MikroPostRepository`（读写全走 em · 懒建保 DB-free · `DrizzlePostRepository` 类与单测不删不改作双轨/回滚点）·新增单测 11 例 + env-gated `tenant-isolation.e2e` 真库 5/5 EXIT=0·默认 `ci` 基线 358 不动（总 369）。路线 B/C（入默认 `ci` / 远程 CI+PG service）未采；除 `posts` 外生产装配未换（仍 Drizzle·跨切面 DrizzleService/EventStore 暂留）；**切片 3a 已落地（迁移链交接·基线法 Agent 代裁·多租户优先）**：新建**迁移专用忠实全模型**实体集（13 表·`database/mikro/migration/`·含 FK 关系/enum/index/unique·与切片 1/2 有损实体零交集）+ 迁移装配独立于 `orm.ts`/app boot（`extensions:[Migrator]`）+ 生成 init 迁移工件 + snapshot + 离线对拍脚本 `scripts/mikro-migration-baseline.ts`；scratch 库与 Drizzle 现 schema 结构级逐表对拍 **13/13 PASS·零漂移**；`entities.ts`/`post.entity.ts`/`orm.ts` 零改动→默认 `ci` 基线 353/369 不动·`drizzle/` 冻结不删；**真库基线登记已于人一次性明示签核后执行（§5.6·`checkSchema` 预检绿 + `logMigration` 基线·零数据表 DDL·`nestjs_practice` 已纳入 Mikro 迁移链）**·**3b 已实现落地（§5.8·`BA_ADAPTER` 双轨·缺省 drizzle·生产翻转归运维另定·`auth.implement.ts` 单点择适配器·双轨不删旧）**·**3c-i 已实现落地（§5.10·v0.12.0·人裁分支 B + 签核实现 3c-i・3 处已有实体覆盖仓储 platform-identity/tenant-status/suspend-user 改走 Mikro·零补实体·双轨不删旧・表所有权守卫同步增强为 ORM 无关）**·未含 3c-ii（workspace/user_status/event/tenant_subscription 四表补实体 + 剩 6 仓储・触高危 1）；切片 3c-ii/4 开工前仍须人**逐项明示签核**（§4 高危清单 1/2/3/4·Agent 不得自行执行）。
