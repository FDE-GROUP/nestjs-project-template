# MikroORM 承载 DDD 持久化 + Better Auth 经 adapter 标准接链 · 可行性勘察

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）
> 关联: [tooling-standards.md](../specs/tooling-standards.md) §2/§3（ORM=Drizzle 强制红线·修宪对象）· [architecture.md](../specs/architecture.md)（Clean Architecture 端口倒置）· [external-borrowing-backlog.md](./external-borrowing-backlog.md)（V 序列登记）
> 日期: 2026-10-15 | 证据基线: **实机 spike**（Bun 1.3.14 + PostgreSQL（nestjs-pg-dev·专用 scratch 库 `mikro_spike`·毕已 DROP）+ MikroORM v7.2.5/v6.6.17 + better-auth 1.7.7（与本仓同版）+ better-auth-mikro-orm 0.5.0 + @mikro-orm/migrations）；文档面 = mikro-orm.io（v7 "Unchained"·2026-03）、better-auth.com（`concepts/database`、`guides/create-a-db-adapter`）、npm registry 实查
> 缘起: 人取向（2026-10-15）："更看重 DDD 贴合度，可考虑修宪；对接 BA 不应成为制约，BA 官方有数据库提供者标准"——本文即该取向的 A 勘察（人裁"同意，A"）
> 本文只作制定 plan 的**参考**，结论须经人二次核验后方可写入方案（`workflow.md` §3）；**不裁决、不写生产代码**
> 受众: **Agent 可参考（非依据）· 人主导判读**

---

## 0. 勘察目的

回答修宪（ORM 由 Drizzle → MikroORM）立项前的三个事实问题：①BA 接链是否有**官方规格内**的可行路径且实机可通；②MikroORM v6/v7 在本仓运行时（Bun/ESM/PG）的实态裂缝；③DDD 贴合度收益与本仓迁移成本的可审账目。**裁决（修宪与否）归人**，本文只供 B 修宪案作输入。

## 1. 结论速览

**有条件可行（GO 给 B 案的输入项，附三条硬前提）**：

1. **BA 接链不是障碍**：官方 `createAdapterFactory`（`better-auth/adapters` 公开导出）+ 官方一致性测试套件 `@better-auth/test-utils`（**实查 v1.7.7 存在·与 BA 同步出版·peer vitest ^4||^5——本仓 vitest ^5.0.4 兼容**）构成"官方规格"的完整闭环；v6 全链 spike **实机绿**（signUpEmail→getSession→listSessions→DB 真行 ×3，§3）。
2. **社区包不可直用、自持变体是必选项**（非可选项）：`better-auth-mikro-orm@0.5.0` 实锤缺 `transaction` 配置（多表写无原子性——建号= user+account+session 三表，半途失败即脏态）、使用**全局 `orm.em`**（并发/身份 map 串租户风险，与本仓 ALS 租户上下文模式冲突）、双构建 CJS 线在 Bun 下 require ESM 不稳定复现、且**与 v7 结构性不兼容**（v7 metadata 改 class-key，其字符串寻址必 miss）。好消息：它证明 factory 路线工作量小（334 行实现 8/8 必选方法），自持变体按官方规格补齐即约同一量级 + `consumeOne/incrementOne/createSchema`。
3. **版本站队是真空窗**：v7（本线旗舰）与现有 BA adapter 生态（peer ^6）**结构性断裂**（v7 metadata 改 class-key，社区包字符串寻址必 miss·R2·运行时无关）。曾记的"Bun `fs.glob` 缺口致 migrate 断"（R1）**经复测订正为不实**——真身是缺 `tinyglobby` 隐含可选依赖，补装后 **v7 迁移链在 Bun 下实机全绿**（§2.5）；换 Node 对 v7 **非必要**。v6 全链通但属"上一代"。**无论选谁/选何运行时，B 案必须写死运行时实证门禁（gated e2e 全链进 CI），不可采信文档面兼容。**

## 2. 实机取证账（spike verbatim·可复跑）

环境：`/tmp/mikro-spike`（v7.2.5）与 `/tmp/mikro-spike/v6`（6.6.17）；脚本 `spike1.ts/spike1b.ts/spike2.ts/probe*.ts`；registry=npmmirror。

### 2.1 MikroORM v7 × Bun（无 PG 依赖部分全过）

| 取证点 | 结果 |
|---|---|
| `MikroORM.init` + `defineEntity`（**零装饰器/零 reflect-metadata**·S9 三重约束在此形态下不适用=结构减负） | ✅ |
| `p` 属性 DSL 实态 | 命名与首页示例有出入：无 `p.number()`（用 `p.integer/float/decimal`）；`hasDefaultRandom` 不存在；双向关系须显式 `inversedBy` 或省略 |
| schema 生命周期 | v7 API 换形：`orm.schema.update()/create()/clear()`（v6 为 `updateSchema()/createSchema()/clearDatabase()`）；`getUpdateSchemaSQL` 差量=空 ✅ |
| Identity Map / UoW | 同 em 内 `findOne` 同引用 ✅；改属性后裸 `flush()` 差量落库 ✅（本仓现 Drizzle 手动 set 形态的反面教材级体验） |
| migration 生成 `orm.migrator.create()` | ✅ 生成合规 TS 文件（`Migration20261014163945.ts`·含 up/down）；扩展注册形态：`extensions: [Migrator]`（@mikro-orm/migrations 独立包） |
| ~~migration 应用/列表 `runMigrations()/getPending()`~~（**初次 spike·后由 §2.5 订正**） | ❌ 当时崩：`fs.glob does not support options.withFileTypes yet`——**根因非 Bun、非致命**：缺 `tinyglobby` 隐含可选依赖（见 §2.5·补装即绿）；初判为"generate 通、migrate 断"系**误读** |
| 附带发现（DDD 加分项） | v7 平台导出含 **RLS（Row-Level Security）设施**（`computeRlsFilterVariables/getRlsFilterDefs` 符号簇）与 **Kysely 一等集成**（`Kysely/MikroKyselyPlugin` 从驱动包直接导出）——多租户兜底与 SQL 逃生舱俱在 |

### 2.2 v7 × 社区 adapter × BA

| 取证点 | 结果 |
|---|---|
| `mikroOrmAdapter(orm)` 元数据寻址 | ❌ `Cannot find metadata for "User"`——根因实锤：v7 `MetadataStorage.getAll()` 为 **Map<entityClass, meta>**（probe：keys=`class {...}`，`has('User')`=false），adapter 的 `naming.getEntityName(...)` 字符串寻址系 v6 形态（v6 通、v7 必 miss） |

### 2.3 v6 × adapter × BA 1.7.7 全链（spike2·决定性）

| 取证点 | 结果 |
|---|---|
| BA 核心四表 EntitySchema 手写 + `schema.updateSchema()` | ✅ |
| `auth.api.signUpEmail`（asResponse） | ✅ 真 nanoid id（BA 生成）· user/account/session 三表真行（DB count=3） |
| `getSession(cookie)` / `listSessions` | ✅ 200 语义 + session 对象 + 列表 1 |
| 通路前提（全部实锤踩坑，B 案门禁须逐条覆盖） | ① 强制走 ESM 构建（`exports.node.default` 落 `.cjs` → `require("better-auth")` ESM-only → Bun `require() async module unsupported` 依求值序不稳定）；② `allowGlobalContext: true`（adapter 用全局 em，v6 默认禁全局上下文操作）；③ **README 的 `generateId:false` 指引不可照抄**——BA string id（nanoid）须由 BA 生成，交还 ORM 即 `Value for User.id is required` 422；④ 手写 entity 字段以 BA 真 schema 为准（本 spike 实错：session 缺 `expiresAt`） |

### 2.4 社区 adapter 覆盖面账（源码 334 行逐读）

- 必选 8/8：`create/update/updateMany/delete/deleteMany/findOne/findMany/count` ✅（基于官方 `createAdapterFactory`，config 含 `supportsJSON`）
- 可选 0/3：`consumeOne` ❌ `incrementOne` ❌ `createSchema` ❌（→ BA 回落条件删/带界重试的非原子路径；CLI 生成 schema 不可用）
- `transaction` **未配置**（config 仅 adapterId/adapterName/debugLogs/supportsJSON）→ 多表写**顺序执行无原子性**，官方文档明示此形态错误处理"not as robust"
- 维护面：0.x（latest stable 2026-04-19）、next 线静置、peer `@mikro-orm/core ^6`、单维护者

### 2.5 R1 复测订正（2026-10-15·推翻初判）

上轮 §2.1 将 `getPending()/runMigrations()` 崩溃归因为"Bun 原生 `fs.glob` 缺陷"，**此为误读，现订正**：

- **真身**：MikroORM v7 `utils/fs-utils.js` 的 `globSync` 有降级——启动 `fs.init()` 动态 `import('tinyglobby')`（`MikroORM.js:22`），**装得上则用 tinyglobby（纯 JS·跨运行时）**，装不上（`.catch(()=>null)`）退回 Node 原生 `globSync({withFileTypes:true})`；而 Bun 的原生 `globSync` 不支持 `withFileTypes` → **仅当缺 tinyglobby 时**才崩。
- **依赖面实锤**：`tinyglobby` **非任何 @mikro-orm 包声明依赖**（`core` deps 空·`migrations→sql→kysely`、`postgresql→kysely/pg`均不含）——即 v7 把一个跨运行时必需件当**未文档化的可选隐依赖**，默认 `bun add` 不带它。
- **复测（Bun 1.3.14·spike-migrate.ts）**：`bun add tinyglobby@0.2.17` 后 → `init（glob=function·已走 tinyglobby）→ schema.update() → migrator.create() → getPending()=1 → runMigrations() → ALL GREEN`。**v7 迁移链在 Bun 下可跑通**，换 Node 对 v7 非必要。
- **附带取证（弃 Bun 成本账·供运行时修宪案）**：全仓 `Bun.*`/`bun:` API 扫描计数 **=0**（apps/packages/libs/src·排除 node_modules/dist）——若将来弃 Bun，**源码层零改动**，耦合纯在工具链层（package.json/Dockerfile/CI/husky/scripts ci.ts 的 `bun:shell`）。

## 3. DDD 贴合度判读（人取向的正面对账）

1. **与 shared-kernel 的接缝是"补全"而非"替换"**：本仓 `AggregateRoot.recordEvent/pullDomainEvents`（"record then pull"）的持久点派发，在 MikroORM 下获得**机制化收口点**——UoW `onFlush`/flush 事件即天然"pull 时机"，`DomainEventPublisher` 端口（先 append 后 publish 双模序）实现侧可挂 flush 前后而**端口签名零震动**；ES Phase B 的"写路径切换"预算正是为这种缝留的。
2. **端口倒置已划好爆炸半径**：`EventStore/DomainEventPublisher`/仓储 port 均框架无关（knowledge 卡实录：适配器实现端口、以类型契约约束）；换 ORM 的实改集中在 **infrastructure adapter**——本仓现量：drizzle 触面 36 文件（其中测试 15）、`pgTable` ×14、drizzle 迁移链 9 文件需交接 Mikro migrations（快照/基线另核）。
3. **Filters/RLS 与 S2 仓储卡点**：MikroORM 全局 Filters 提供"每查询自动施加租户谓词"的机制兜底（漏挂即红），v7 RLS 更进数据库层——与本仓"仓储层唯一卡点"**不冲突而是叠甲**；采纳与否属 B 案裁决点。
4. **反向风险（须写入修宪案的诚实面）**：Identity Map 长生命周期是双刃剑（本仓 e2e/脚本须严格 per-request fork——v6 全局 em 之坑即预演）；SQL 掌控力上限低于 Drizzle（复杂查询走 Kysely 逃生舱=新增一套心智）；UoW 隐式写让"哪些 SQL 将执行"不再显式可审（本仓"审 SQL 后 migrate"纪律需适配快照 diff 流程）。

## 4. 运行时/生态风险清单（待人二判）

| # | 风险 | 级别 | 备注 |
|---|---|---|---|
| R1 | ~~Bun × v7 `fs.glob` 缺口致 migrate 链断~~ **已订正：非 Bun 缺陷** | 低·已消解 | 实为缺 `tinyglobby` 隐含可选依赖（未文档化）；**补装即 Bun 下全绿**（§2.5）。采纳 v7 时只需把 `tinyglobby` 显式钉进依赖并作隐含 peer 登记；与"是否换 Node"无关 |
| R2 | v7 与 BA adapter 生态断裂（peer ^6） | 高·已实锤 | 自持 adapter 变体可解（v7 新寻址 API 已知：getAll Map/getByTableName） |
| R3 | custom adapter 无运行时 `validateSchema` 注册通道（官方文档原文） | 中 | 补位：`@better-auth/test-utils` 一致性套件进 CI + `auth check schema` CLI 显式跑；兜底等级低于现 Drizzle 形态 |
| R4 | organization 插件/quota 钩子/additionalFields 的 entity 面本 spike **未验**（仅核心四表） | 中 | B 案第一强前置 spike：以本仓现 drizzle schema 全表面复刻 |
| R5 | MikroORM 本体单维护者 + v6→v7 破坏节奏（forceUtcTimezone 默认翻转等） | 中 | 与 BA 依赖链叠加=双 bus-factor |
| R6 | 迁移工程总量（36 文件触面/14 表/9 迁移/15 测试文件换形/gated e2e 全链重写） | 大·可分片 | 垂直切片渐进：单非 BA 上下文先行→BA 面→全量；每片独立过审计门 |

## 5. 明确不做（本勘察边界）

- 不裁决修宪（归人）；不装依赖进仓、不碰 `docs/specs`；
- 未测：organization 插件实体、genericOAuth 回调面、并发压测（全局 em 泄漏场景复现）、@mikro-orm/nestjs 集成形态（大概率被本仓自有 DI 装配替代，B 案再核）、MongoDB/多 DB 面（本仓钉死 PG，无关）。

## 6. 下一步指针

B 修宪案（现名 [global-orm-mikro-constitution-amendment](../plans/global-orm-mikro-constitution-amendment.md)·v0.1.0 已起草 2026-10-16·待审计·本勘察为其唯一事实输入源）输入清单：版本站队裁决（v6 保守 / v7+自持 adapter+等 Bun）、自持 adapter 的官方套件门禁设计、§4 R1~R6 逐条对策、分片迁移路线（含 table-ownership/schema 快照交接）、`docs/specs` 修订文案（§2 ORM 行、§3 禁条、§4.3 S9 形态在 defineEntity 下的退役声明）。

**派生指针（v0.2 新增）**：因 R1 订正与"全仓零 `Bun.*` API"取证，"弃 Bun → Node+pnpm"已确立为**与 ORM 立场正交的独立工具链修宪**（非为 v7 服务），另立 [global-runtime-node-pnpm.md](../plans/global-runtime-node-pnpm.md)。

**取证重采回填（v0.2.2 追补）**：人裁 Q1＝v7+自持 adapter 后，本案切片 0 已在 **Node 22 + pnpm isolated + 真 PG 15** 下重跑本文 §2.1/2.3/2.5 全部取证点（账目见 [global-orm-mikro-constitution-amendment](../plans/global-orm-mikro-constitution-amendment.md) §5.1）——**R1 与本文同结论（Node 亦不复现·tinyglobby 可解析）**；迁移链、UoW/Identity Map、v7 自持 adapter 接 BA 三表真行均绿；R2 给出 class-key 桥法。**但 organization / genericOAuth / additionalFields / quota / `@better-auth/test-utils` 一致性套件（本文 §4 R4）仍未跑 → 未结清**；本文作为**参考快照不随运行时刷新**，Node 实机账目以 plan §5.1 为当前真相。

## 7. 演变记录

- v0.1（2026-10-15）：初稿。spike 全量证据入账（§2）；社区包定位由"依赖候选"降为"参考实现"（§1-2 依据）；v7 两处真裂缝为意外收获（§2.1/2.2·文档面均未预告）。
- v0.2（2026-10-15）：**R1 订正**（人追问"是否换回 Node"触发复测）——初判"Bun `fs.glob` 缺口致 v7 migrate 断"**不实**，真身是缺 `tinyglobby` 隐含可选依赖，补装后 v7 迁移链 Bun 下实机全绿（§2.5）；R1 由"高·已实锤"降为"低·已消解"；新增"全仓零 `Bun.*` API"取证（弃 Bun 属纯工具链修宪·与 v7 立场无关）。
- v0.2.1（2026-10-16）：仅 §6 指针订正——人裁「出 B 案」后案名落地为 `global-orm-mikro-constitution-amendment.md`（原预留的 `tooling-mikro-orm` 不合本仓 `global-*` 修宪命名惯例）；**本文结论未动**，取证重采（Bun→Node 基线）由该案切片 0 承接。
- v0.2.2（2026-10-16）：§6 追补取证重采回填指针——切片 0 已在 Node+pnpm+真 PG 重跑 §2.1/2.3/2.5 并全绿（账目入 plan §5.1·R4 面仍未结清）；本文仍为 **Bun 1.3.14 参考快照**·不逐运行时刷新，当前真相以 plan §5.1 为准。
