# 全栈 CI 拼 PG：Testcontainers 自动拉起真库跑 env-gated e2e（readiness §2.3-#6 兑现）

> 适用范围: `全局`（工具链·测试基建） ← blast radius，审计深度=人签核（`workflow.md` §3/§5）
> 关联: [microservice-readiness.md](./microservice-readiness.md) §2.3-6（「归既有『全栈 CI』专项，不另立项」——本 plan 即该专项的正式立项） · `specs/tooling-standards.md` §2 工具矩阵/§4.10 对拍纪律 · `AGENTS.md` §3/§4 · global-tenancy §10（v0.18.12 收尾挂账）
> 性质: 新建（首版）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**痛点（实测坐实·非臆造）**：仓库存有 **6 个 env-gated 真库 e2e**（`E2E_DATABASE_URL` 开关）+ **1 套 BA authFlow 一致性套件**（`BA_MIKRO_CONSISTENCY=1`·scratch 库名断言 `mikro_ba_consistency`），全部依赖**手工预备的真实 Postgres**（历史轨迹：`nestjs_e2e` 手工建库 → ORM 案 G1 手工 `BA_ADAPTER=mikro` 复跑 → 本次游标 e2e 手工指 `nestjs_practice`）。每片「gated e2e 真库 N/N 绿」都需人工装环境、且各机器结论不可复现；`ci:db`（check→test→test:auth-consistency）名义存在，实际同样靠手工库支撑。默认 `ci` 保持 DB-free 不变量（`vitest.config.ts` 注释明示），这半边不动。

**目标**：一条命令 `pnpm run ci:db`（或按丙裁的等价入口）**自动拉起一次性 PG 容器 → 重放既有基线迁移建 schema → 跑全量 gated e2e + 一致性套件 → 用完即焚、零足迹**，使「带 DB 验收」从手工姿势变为可复现门禁辅具；为后续 ES Phase B 后半（outbox/relay·readiness #2）的验证密度打底。

**非目标（明确不做）**：
- ❌ 不引入远程 CI 测试流水线（`AGENTS.md` §4：L1=本地 CI·不走远程；GitHub Actions service-container 路线**不采**）；
- ❌ 不动默认 `ci` / `ci:quick` / `pre-push` 门禁与其 DB-free 不变量（改既有门禁=高危#3，本片不取）；
- ❌ 不改 6 个 gated e2e 与一致性套件自身的 `describe.skip` 门控机制（分层 e2e 策略保持·runner 只供 env 与库）；
- ❌ 不引 Redis/其他中间件容器（仅 PG）；不触生产 schema/迁移链（只**重放**已提交基线 `Migration20261016055354`·零新迁移）。

## 2. 方案

### 2.1 机制（Testcontainers·node 编排脚本）

- **新 devDeps**：`testcontainers` + `@testcontainers/postgresql`（官方 npm·Testcontainers 生态·无工具链红线冲突；非 Prisma/TypeORM 类裁判冲突项）。
- **新脚本** `scripts/ci-fullstack.ts`（**tsx 运行**·沿 `mikro-migrate.ts`/`seed.ts` 先例：值导入 `.ts` 迁移装配 `initMigrationOrm`，Node 原生 type-stripping 不解析省略扩展名的相对 ESM 导入·R-η）：
  1. `new PostgresContainer(<乙裁镜像>).withDatabase(<丁裁拓扑>).start()`——**随机宿主端口**（不与在跑 `nestjs-pg-dev` 的 5432 相撞）；`TESTCONTAINERS_RYUK_DISABLED=true`（Ryuk 镜像本地没有、境内 pull 有风险）＋ `finally` 显式 `container.stop()` 自清；镜像缺失时 pull 走 daemon 已配国内镜像源（`global-cn-adaptation`），失败**点名 fail-loud**；
  2. 每库重放基线：`initMigrationOrm(url)` → `orm.migrator.up()`（13 表·与 `db:setup` 同路径·**永不** `schema.create/synchronize`——守 tooling §4「generate+migrate」纪律）；
  3. `spawnSync('pnpm', ['vitest','run', ...gated 文件集])`，env 注 `DATABASE_URL=E2E_DATABASE_URL=<容器串>`（6 文件现契约：开关取 `E2E_DATABASE_URL`、连接串取 `DATABASE_URL` 或直读本变量——两变量同指一库即覆盖全部形态）；
  4. 一致性套件：`vitest run --config vitest.consistency.config.ts`，env 注 `DATABASE_URL=<mikro_ba_consistency 库串>` + `BA_MIKRO_CONSISTENCY=1`（满足 `assertScratchDb` 库名恒等断言·防误指真实库的既有安全前置原样生效）；
  5. 汇总退出码：任一套件非零 → 整体非零（硬门禁语义）。
- **入口接线（按丙裁）**：`pnpm run test:fullstack` = `tsx scripts/ci-fullstack.ts`；`ci:db` 重定义为 `check → test → test:fullstack`（一致性并入第 4 步后，独立 `test:auth-consistency` 脚本保留作 ad-hoc）。

### 2.2 垂直切片

1. **切片 A · runner 落地**（依赖 + `scripts/ci-fullstack.ts` + package.json 脚本）——完成判据：`pnpm run test:fullstack` 实跑 EXIT=0，全量 gated e2e（6 文件）+ 一致性（9/9）绿，毕后 `docker ps -a` 无残留容器、宿主端口释放（零足迹·§4.10 对拍口径）；
2. **切片 B · 门禁接线 + 默认面回归**——完成判据：`pnpm run ci:db` 全链 EXIT=0；默认 `pnpm run ci` **基线 380 passed | 20 skipped 不动**（DB-free 不变量·gated 仍 skip）；Biome 净；
3. **切片 C · 文档对账**（触高危#6·随本 plan 签核覆盖）——`tooling-standards.md` §2 工具矩阵登记 Testcontainers 行 + 命令面；`AGENTS.md` §3 常用命令补 `ci:db` 一行（指针不复述细节）；`microservice-readiness.md` §2.3-#6 留痕「已兑现·另片落地」+ 本 plan 状态经 README 索引单源。

### 2.3 归人裁点（甲–戊）

- **甲 · 机制**：Testcontainers npm（推荐·生命周期/端口/清理托管）vs docker CLI 裸编排（零新依赖但重造清理逻辑）vs GH Actions service（违 L1 纪律·不取）。
- **乙 · 镜像**：`postgres:16-alpine`（推荐·与 `docker-compose.dev.yml` 开发档一致·本机已有实存免 pull）vs `postgres:15`（与在跑 `nestjs-pg-dev` 一致）。
- **丙 · 入口**：`ci:db` 重定义为含 fullstack（推荐·其语义即「带 DB 的 CI」·现 `ci:db` 本就靠手工库、非默认门禁）vs 另立 `ci:fullstack` 并行、`ci:db` 不动。
- **丁 · 库拓扑**：一容器双库——`ci_e2e`（gated 套件）+ `mikro_ba_consistency`（一致性·名恒 `assertScratchDb`）（推荐·单生命周期两硬断言面互不共表）vs 一容器单库共用 vs 双容器。
- **戊 · 宪法落地面**：按 2.2 切片 C 全落（推荐）vs 只落 tooling 矩阵不动 `AGENTS.md`。

## 3. 影响面与风险

- **blast radius / 可逆性**：全部为 dev 面增量（devDeps×2 + 新脚本 + scripts 键 + 文档三处），**零生产码 / 零 schema 变更 / 零既有门禁改动**；可逆＝删脚本与依赖、`ci:db` 回退旧串。命中高危：**#6 改 `docs/specs` 宪法**（切片 C·随本 plan 签核覆盖）；新依赖为 devDependency 常规增补（非「删依赖」高危#2 语义）。
- **主要风险**：
  1. **Ryuk 禁用后的清理兜底**——依赖 `finally stop`；进程被强杀可能留容器 → 脚本启动前先按 label 清扫遗留（`testcontainers.*` 容器同名回收）或如实提示手工 `docker rm`（登记不掩盖）；
  2. **pnpm `minimumReleaseAge`/元数据超时 fail-closed 误导**（既有工具坑）——安装新 devDeps 时实测坐实，受阻走 npmmirror 或按既有口径人工处理，不擅改策略；
  3. **WSL2/Docker Desktop 宿主可达性**——Testcontainers 随机映射在 `DOCKER_HOST` 场景的宿主地址以**实跑对拍**为准（§4.10：配置就位不算完成），失败即上报归人不启发式绕过。
- **回滚策略**：revert 切片 commit 即净（无数据面残留·容器一次性）。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计·开工签核**（人 AskUserQuestion 逐裁 2026-10-17：甲=Testcontainers（随择「B·全栈 CI 拼 PG」隐含批准）·乙=`postgres:16-alpine`·丙=重定义 `ci:db`（一致性并入 test:fullstack）·丁=一容器双库（`ci_e2e` + `mikro_ba_consistency`）·戊=三面全落（高危#6 随签覆盖））
- 未决项：无（甲–戊已逐裁）
- 审计人 / 日期：人（AskUserQuestion 四题全取推荐+甲随主线选择）/ 2026-10-17

### 4.1 执行完成留痕（2026-10-17）

- **切片 A**：devDeps `testcontainers`+`@testcontainers/postgresql` ^12.2.1；`scripts/ci-fullstack.ts`（tsx·乙=16-alpine·丁=一容器双库 `ci_e2e`+`mikro_ba_consistency`·基线重放各 1 迁移）；`test:fullstack` 新脚本 + `ci:db` 重定义（丙）。安装期拓 pnpm 11 新坑：`pnpm add` 往 `pnpm-workspace.yaml` 写 `allowBuilds` 占位行（`set this to true or false`）致后续命令 fail-closed——三可选原生依赖（cpu-features/protobufjs/ssh2·本仓只用本地 Docker+PG 模块不碰 SSH/compose）显式置 `false` 方绿。
- **切片 A′（验收拓出的真缺陷·沿「机制修复不逐模块特判」）**：首跑 tenant-isolation e2e `GET /posts` 500 `column "nan" does not exist`——根因=**5 个 gated e2e harness 均不复现 `main.ts` 的 `useGlobalPipes(I18nValidationPipe)`**，无管时 `@Query() ListCursorDto` 是裸 `{}`，`limit=undefined`→`limit+1=NaN`→kysely 产坏列。修复：抽 `common/validation-pipe.ts` 工厂单源（`main.ts` 换引用行为等价·`validation-i18n.e2e` 同形内联管一并换工厂消双源），5 个 e2e 补 `useGlobalPipes(createValidationPipe())`。连带订正 tenant-isolation 越界写测断言：严格管下伪造 body 字段实为 **400 拒入**（原「201+盖归属」系无管 harness 下的非生产语义；仓储层盖归属兜底仍由隔离单测锁，双防线不弱化）。
- **验收实跑**：`test:fullstack` EXIT=0——gated e2e **6 文件 20/20 全绿**（与默认 `ci` 的 20 skipped 严丝合缝：取 PG 后 skip 面全数翻真库绿）+ 一致性 9/9；毕 `docker ps -aq --filter label=org.testcontainers=true --filter ancestor=postgres:16-alpine` 计数 **0**（零足迹）；`ci:db` 全链 EXIT=0；默认 `pnpm run ci` PASSED **基线 380 passed | 20 skipped 不动**（DB-free 不变量保持）。

## 5. 完成判据（可核验 + 穷尽）

- [x] 甲–戊逐裁留痕于 §4（人签核）
- [x] `pnpm run test:fullstack` 实跑 EXIT=0：gated e2e 6 文件全绿（20 测）+ 一致性 9/9（真容器真库·存照）
- [x] 跑毕零足迹：`docker ps -aq`（testcontainers 标签 × 本镜像）计数 0
- [x] `pnpm run ci:db`（丙裁：重定义含 test:fullstack）全链 EXIT=0
- [x] 默认 `pnpm run ci` 基线 **380 passed | 20 skipped 不动**（DB-free 不变量·gated 仍 skip）+ Biome 净 + build 0 错
- [x] 文档三面（tooling 矩阵 / AGENTS §3 / readiness §2.3-#6 留痕）落账·README 索引状态翻绿
- [x] 不触默认门禁/生产码语义/schema/迁移链（`main.ts` 换工厂行为等价·零新迁移·仅重放既有基线）；切片 A′ 属测试装配面 + 等价提取，如实登记于 §4.1

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 用户择定下一主线「B·全栈 CI 拼 PG」（AskUserQuestion）·立案勘察后起草 | 首版：痛点实据 / 机制 / 三切片 / 甲–戊裁点 / 风险登记 |
| 2026-10-17 | 0.1.1 | 审计门过人签核 | §4 甲–戊逐裁留痕（乙=16-alpine·丙=重定义 ci:db·丁=一容器双库·戊=三面全落）；README 索引翻「已审计·开工」 |
| 2026-10-17 | 0.2.0 | 三切片+A′ 落地·验收全绿 | 新增 §4.1 执行留痕（含切片 A′：harness 缺生产管拓出 SQL NaN 真缺陷·validation-pipe 工厂单源·越界写断言订正为 400 拒入·pnpm allowBuilds 占位行坑）；§5 DoD 全勾；README 翻「已完成·待人类验收」 |
| 2026-10-17 | 0.2.1 | 人类验收·结项 | 人同意（含切片 A′ 超出字面裁示的断言订正口径确认）；README 索引翻「已验收·结项」·commit `8497e25` |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.2.1 变更，以当前正文内容为准。
