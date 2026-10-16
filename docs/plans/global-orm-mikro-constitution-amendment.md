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
- **切片 2 · expand：单上下文试迁移**——选一个**非 BA、低触面**上下文（拟 `posts` 参考切片·定名归人）做 entity + repository adapter，新旧双轨并存，跨切面（DrizzleService / EventStore）**暂留 Drizzle**；行为对齐以**既有测试不改动仍绿**为准（禁为过测改断言）。
  完成判据：该上下文读写全走 Mikro 且回归绿；触面清单与回滚点成文。
- **切片 3 · BA 面接链切换**——auth/tenancy/users 的数据面换自持 adapter；迁移链**交接**：以现存 PG schema 为基线生成 Mikro init migration，`drizzle/` 冻结保留不删（口径类比「push 管理的库不能直接 migrate」的既有教训）。
  完成判据：真库 migrate + seed 往返绿；`verify:prod-boot` 200；gated e2e 全链（sign-up/sign-in/session/organization）进防线脚本。
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

---

<!-- 变更戳 -->
正文已于 2026-10-16 / v0.4.0 变更（人授意按建议自裁三个归人点·整案审计门裁定＝GO·一致性套件入硬门禁待切片 1 随实现签核·切片 0 夹具追认为惯例），以当前正文内容为准；审计门已过、但 **GO ≠ 实施片开工签核**（§4 高危清单 1/2/3/4 逐片仍须人明示签核·Agent 不得自行执行）。
