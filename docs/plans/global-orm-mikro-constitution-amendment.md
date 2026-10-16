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
  🟡 **部分落地（人签核范围「仅 3a」·基线法 Agent 代裁·多租户优先·2026-10-16·详见 §5.5）**：**3a（迁移链交接）已完成**——忠实全模型实体集（13 表·含 FK/enum/index/unique）+ 迁移专用装配（独立于 `orm.ts`/app boot）+ 生成 init 迁移工件 + scratch 库与 Drizzle 现 schema **结构级逐表对拍全 PASS·零漂移**；**真库基线登记已于人一次性明示签核后执行**（§5.6·`checkSchema` 预检绿 + `logMigration` 基线·零数据表 DDL·`nestjs_practice` 纳入 Mikro 迁移链·`drizzle/` 冻结）。**3b（BA adapter 接链单点切换）开工方案已起草 + 归人裁点 Agent 代裁（§5.7·v0.9.1-draft·待开工签核·未执行）· 3c（app 仓储分批切）未开工**。
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

### §5.7 切片 3b 开工方案（拟·归人裁点已 Agent 代裁·待开工签核·未执行）

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

---

<!-- 变更戳 -->
正文已于 2026-10-16 / v0.9.1-draft 变更（**切片 1 已落地 + 门禁接入已人签核路线 A + 切片 2 已落地（expand 双轨·定名＝`posts`）+ 切片 3a 已落地（迁移链交接·基线法 Agent 代裁·多租户优先）**：自持 v7 adapter + 零装饰器实体 + EntityCaseNamingStrategy + raw `em.execute` 寻址；验收 authFlow in-repo 8/8 EXIT=0 + 真行×3 存照；`supportsDates:false` 为 raw 形态对 pinpoint③ 的取反；独立 `pnpm run ci:db`（未劫持默认 `ci`/pre-push）+ `assertScratchDb` scratch 库名断言安全前置；**切片 2**：`posts` 数据面单点改绑 `MikroPostRepository`（读写全走 em · 懒建保 DB-free · `DrizzlePostRepository` 类与单测不删不改作双轨/回滚点）·新增单测 11 例 + env-gated `tenant-isolation.e2e` 真库 5/5 EXIT=0·默认 `ci` 基线 358 不动（总 369）。路线 B/C（入默认 `ci` / 远程 CI+PG service）未采；除 `posts` 外生产装配未换（仍 Drizzle·跨切面 DrizzleService/EventStore 暂留）；**切片 3a 已落地（迁移链交接·基线法 Agent 代裁·多租户优先）**：新建**迁移专用忠实全模型**实体集（13 表·`database/mikro/migration/`·含 FK 关系/enum/index/unique·与切片 1/2 有损实体零交集）+ 迁移装配独立于 `orm.ts`/app boot（`extensions:[Migrator]`）+ 生成 init 迁移工件 + snapshot + 离线对拍脚本 `scripts/mikro-migration-baseline.ts`；scratch 库与 Drizzle 现 schema 结构级逐表对拍 **13/13 PASS·零漂移**；`entities.ts`/`post.entity.ts`/`orm.ts` 零改动→默认 `ci` 基线 353/369 不动·`drizzle/` 冻结不删；**真库基线登记已于人一次性明示签核后执行（§5.6·`checkSchema` 预检绿 + `logMigration` 基线·零数据表 DDL·`nestjs_practice` 已纳入 Mikro 迁移链）**·**未含 3b/3c**（BA 接链单点 `auth.implement.ts:90` 仍 `drizzleAdapter`）；切片 3b/3c/4 开工前均须人**逐次明示签核**（§4 高危清单 1/2/3/4·Agent 不得自行执行）。
