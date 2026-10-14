# 运行时/包管修宪：Bun → Node + pnpm（弃 Bun 工具链整体迁移）

> 适用范围: `全局` ← blast radius = 工具链全链（构建/运行/测试/容器/CI/hooks），最大半径
> 关联: `specs/tooling-standards.md` §1（三重约束）/§2（运行时+包管理·本地 CI 编排 两行）/§2.1（依赖镜像行）/§3（红线①禁 npm/pnpm/yarn）· `specs/architecture.md`（构建/部署）· `specs/vision.md` · `AGENTS.md` §2/§3 · `research/mikro-orm-ddd-feasibility.md` §2.5（本案缘起取证）
> 性质: 重写型（工具链选型整体替换 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表
> **本阶段只成文方案、呈审计门，零生产代码 / 零 `docs/specs` 改动**（无已审方案不写码 · 高危须人签核）

## 0. 缘起与一个必须先讲的澄清

人取向（2026-10-15）："是否可以考虑把 bun 换回到 nodejs + pnpm，明确使用 MikroORM v7，Adapter 不参考社区包。"

经同轮实机复测（见 [mikro-orm-ddd-feasibility.md](../research/mikro-orm-ddd-feasibility.md) §2.5）**必须先纠一个可能误导决策的事实**：

- 上轮勘察把"MikroORM v7 迁移链在 Bun 下崩"记为 Bun 原生 `fs.glob` 缺陷（R1）——**此为误读**。真身是缺 `tinyglobby` 隐含可选依赖；`bun add tinyglobby` 后 **v7 全链（init→schema.update→migrator.create→getPending→runMigrations）在 Bun 1.3.14 下实机全绿**。
- **结论：换 Node 不是"MikroORM v7 能跑"的前提。** 二者是**正交**的两件事——ORM 修宪（Drizzle→MikroORM v7）属独立决策（本仓另立），本案**只裁运行时/包管**。

据此，本案的正当性**不能挂在 v7 上**，只能独立评估："值不值得用一次工具链重写 + pnpm 布局重验，换长期的生态对齐与风险姿态。" 人经 AskUserQuestion 明确：**本轮只推进运行时修宪（勾选"运行时修宪"，未勾 ORM），落地形态=更新勘察文 + 出 B 案。**

## 1. 背景与目标

**为什么考虑做**：

1. **NestJS 本是 Node 原生框架**——Bun 是相对非常态选择。better-auth / MikroORM / 绝大多数依赖的 CI 首发于 Node，长期追 Bun 兼容面的意外（如本次 glob 语义、CJS/ESM interop 依求值序不稳定）成本不可预估。
2. **源码对 Bun 零耦合**（勘察文 §2.5 实锤：全仓 `Bun.*`/`bun:` API 计数 = 0）——运行时切换在**应用层无改动**，工作量集中在工具链配置，风险面反而收敛、可控。

**目标**：把"运行时 + 包管理"的宪法唯一选型由 **Bun** 替换为 **Node（LTS）+ pnpm**，并保持既有工程纪律（ESM、SWC 构建、Vitest、Biome、Drizzle、本地 CI 门禁、husky/commitlint、npmmirror 境内镜像、端口 7009、`/api/v1` 前缀、装饰器元数据契约）**不回退**。

**非目标**：

- ❌ 不改 ORM（Drizzle 保留；MikroORM v7 是另一独立案，与本切换无依赖关系）。
- ❌ 不改测试框架（Vitest 保留）、不改 Lint（Biome 保留）、不改构建后端默认（SWC 仍用，见 §4 未决项）。
- ❌ 不改业务源码（已证零 `Bun.*`）。
- ❌ 本阶段不动任何真实文件——仅成文本方案，实际切换在过审计门后按 §2 切片执行。

## 2. 方案（垂直切片 · expand–contract）

宽重构走"并存 → 分批切换 → 删旧"。每片可独立验证、CI 绿才进下一片。

- **切片 A · 包管理切 pnpm（最险·先行立验）**
  引入 `pnpm-workspace.yaml` + `.npmrc`（npmmirror registry），生成 `pnpm-lock.yaml`；**关键验证点：pnpm 默认严格非扁平 `node_modules`（isolated/符号链接布局）vs 现 Bun hoisted 布局**，是否破坏 Nest `@nestjs/*` peer 解析、`unplugin-swc` 装饰器元数据、`@core/*` 工作区链接。
  - 完成判据：`pnpm install` 成功 + `pnpm run build:nest` 通过 + `pnpm run test` 全绿（**343 基线一条不掉**）+ `app-boot.smoke` / DI 元数据回归测无回退。
  - 若严格布局破坏解析：决策点=启用 `node-linker=hoisted` 或 `shamefully-hoist`（.npmrc），或逐包 `public-hoist-pattern`——**须实测定档、写进 tooling**。
- **切片 B · 运行时/脚本切 Node**
  `package.json` scripts：`bun run/build` → `node`/`nest`/`pnpm exec`；`start:dev`（`bun --watch`）→ `nest start --watch` 或 `node --watch`；`start:prod`（`bun dist/main.js`）→ `node dist/main.js`；`engines.bun` → `engines.node` + `packageManager` 字段。
  - 完成判据：`pnpm run start:dev` 本机起服 7009 + `/api/v1/health` 200 实机存照。
- **切片 C · 本地 CI 编排 `scripts/ci.ts` 重写（去 `bun:shell`）**
  `$(bun:shell)` 是 Bun 专属 Web Shell API，Node 无等价——改用 `execa`（新增 devDep）或 `node:child_process.spawn`；`Bun.version` → `process.version`。门禁顺序与失败即退语义**严格保持**。
  - 完成判据：`pnpm run ci`（full）与 `ci:quick` 行为与现 `scripts/ci.ts` 逐步等价（check→build→test→fallow advisory）。
- **切片 D · hooks / Docker / 远程 CI**
  `.husky/pre-commit|pre-push`：`bun run …` → `pnpm run …`；`Dockerfile` base `oven/bun:1-alpine`→`node:<lts>-slim`（保留 DaoCloud 境内镜像 ARG 覆盖思路）、`bun install --frozen-lockfile`→`pnpm install --frozen-lockfile`；`deploy-swagger.yml` `oven-sh/setup-bun`→`actions/setup-node` + pnpm cache。
  - 完成判据：`docker compose` 起 + 健康检查过；GitHub Actions dry-run 通过。
- **切片 E · 清理 + 宪法成文（高危·人签核闸门）**
  删 `bun.lock`/`bunfig.toml`；`docs/specs/tooling-standards.md` §1 三重约束（"ESM + Bun + 装饰器元数据"→"ESM + Node + 装饰器元数据"）、§2 两行、§2.1 镜像行、§3 红线①（"禁 npm/pnpm/yarn·统一 bun"→"禁 bun/npm/yarn·统一 pnpm"）**在此片一次改**；`AGENTS.md` §2/§3 命令与红线同步。**本方案文档 ≠ 宪法改动**——§2-E 的 specs 编辑须审计门放行后方执行。
  - 完成判据：specs/AGENTS 与实配无残留 Bun 口径；grep `bun` 仅剩历史演变记录。

## 3. 影响面与风险

- **blast radius：全局·不可单模块回滚**（工具链耦合全链）；**可逆性：中**——git revert 整片可退，但 `pnpm-lock.yaml` 生成后与 `bun.lock` 二选一，切换期锁文件不能并存（须择一权威）。
- **命中高危清单（`workflow.md` §3）**：✅ 改门禁（husky/commitlint/CI scripts）✅ 改 `docs/specs` 宪法（§1/§2/§3）✅ 删依赖/换依赖布局（bun→pnpm·node_modules 结构变）——**三项皆人签核级，Agent 不得自执行**。
- **主风险 R-α：pnpm 严格布局破坏 Nest/SWC/装饰器/工作区解析**（与现 bun hoisted 差异最大处）→ 切片 A 单片先验、失败即采 hoist 兜底并成文；此为本方案**第一强前置实证点**。
- **主风险 R-β：§4.3 装饰器元数据 `import type` 擦除坑不会因换 Node 消失**——本仓用 SWC builder（`decoratorMetadata:true`），换 Node 后**若仍用 SWC 则坑照旧**；若改 tsc builder，`import type` 擦除问题在 tsc 下同样存在（ESM/TS 语义·非 Bun 专属）。**故本案不得声称"修掉 §4.3"**，DI 回归测（`design:paramtypes`/`app.module.test`/`di-context.integration.test`）须原样锁住。
- **主风险 R-γ：343 测试基线重验**——任何切片末尾 CI 掉测即红；gated e2e（13 既有 + 3 HTTP 面）真库链路须在 Node 下复跑一致。
- **终结性发现 R-δ（本案真边界·2026-10-15 运行时起服实证拓出·R-α/β/γ 皆非拦路石）**：**跨 workspace 的 `@core/*` 裸句柄直引 TS 源，是 Bun 宽松解析器的隐性依赖；换 Node 后 prod 起服即崩。**
  - 现象：`pnpm run ci` **全绿**（build 148·TSC 0·343 零掉），但 `node dist/apps/api/src/main.js` 真起服报 `ERR_MODULE_NOT_FOUND: dist/libs/core/src/shared-kernel/context/request-context.js`（`/health` curl HTTP 000）。
  - **定性纠正（实机复测拓出·比原估计更严重）**：`bun dist/apps/api/src/main.js` 报**完全相同的 `Cannot find module`**——即“当前 main 基线下、编译产物 prod 在 **Bun 与 Node 下都跑不起来**”。R-δ **不是 Node 专属回归，而是先于本迁移、与运行时切换正交的潜伏 prod 构建债**：Bun dev（`bun src/main.ts`）能跑只因直吃 TS 源 + tsconfig paths；真 prod 路径从未被端到端跑过（Dockerfile `start:prod` 甚将路径拼为 `dist/main.js`）才一直未暴露。**⇒ “维持 Bun”不等于“prod 可跑”（前文“A 零风险”的说法据此作废）。**
  - 根因链：① 源码 `import '@core/shared-kernel/context/request-context'`（裸句柄·无扩展名）→ ② SWC 编译把它重写为相对路径并补 `.js`，指向 `../../../../libs/core/src/…request-context.js`（**指 TS 源码目录**）→ ③ `nest build`（sourceRoot=`apps/api/src`）**只编译 apps、不编译 libs**，`dist/libs/core/` 根本不存在 → ④ Node 严格 ESM 解析落空。**为何测试全绿掩盖**：Vitest 经 `resolve.tsconfigPaths` 把 `@core/*` 即时解析回 `libs/core/src/*` TS 源——**CI 绿 ≠ prod 起服可跑**，唯运行时起服实证戳穿（印证本案门禁"须运行时实证、不采信文档面/CI 面兼容"的纪律价值）。
  - **性质**：架构级、越出"自裁 5 参数"授权范围——修法=**多包构建重设计**（`libs/core` 独立编译 + `package.json` exports 指向 dist + 句柄规格化；或让 `nest build` 同编 apps+libs 两棵树入 dist），非工具链配置微调可解。
  - **处置**：按铁律"遇边界即停·归人裁"——已把代码/config 全量回退至绿色 Bun 基线（`git checkout` 九文件 + 删 pnpm 产物 + `bun install` 复原 hoisted·`bun.lock` 未删·未碰 `docs/specs` 宪法与 `AGENTS.md`），**未把 dev/prod 运行时已坏的工具链推上 main**。R-δ 修复待人在 §4.5 三选一裁决后方可启动。
- **收益诚实面**：生态对齐/风险姿态是**长期**收益，非即时功能收益；切换期净成本 = 5 片工具链重写 + 全链重验 **+ R-δ 多包构建重设计（新发现·原方案未预见）**。npmmirror 境内镜像 pnpm 同样支持，**镜像不构成理由**。

## 4. 审计记录（**已审计** · 人授权自裁）

> 无已审方案不写码。本案全局 + 不可逆 + 命中三项高危 → 人签核。**人于 2026-10-15 以「照建议自裁」放行审计门**，未决项交 Agent 按建议自裁。

- **结论**：**已审计·开工**。切片 A 实测（2026-10-15·pnpm 11.7.0）：**R-α 证伪**——isolated 严格布局下 build 148 文件·TSC 0、**343 基线（327/16）零掉**、DI/装饰器元数据回归全绿、`@core/saas-kit` workspace 链接正常。
- **未决项裁决（Agent 自裁·据实）**：
  1. **Node LTS 基线**：`engines.node = >=22.0.0`（匹配实机 v22.23.0·24 LTS 留后续复验，本案不引）。
  2. **pnpm 版本**：`packageManager = pnpm@11.7.0`（实机验证版）。
  3. **构建后端**：**沿用 SWC**（`nest build --builder swc`·切片 A 实证 isolated 下编译通过·§4.3 坑面不变已知可控）。
  4. **包管严格度**：**默认 isolated（严格非扁平）**——切片 A 实证无需 `node-linker=hoisted`；唯一必需配置=`pnpm-workspace.yaml` 的 `allowBuilds` 放行 `@swc/core`+`esbuild`（pnpm 11 默认拦截 postinstall 原生二进制·不放行则 SWC/esbuild 运行时崩·此为本案唯一 pnpm-vs-bun 真实摩擦点）。
  5. **ORM**：排除本案（人未勾·与运行时正交）。
- 审计人 / 日期：人（「照建议自裁」） / 2026-10-15

## 4.5 实证进展（切片 A–D）与受阻 R-δ（**进行中·受阻·待裁**）

人以「照建议自裁」放行后，Agent 按 §2 顺序执行，结果如下（代码/config 已全部回退，仅留本记录）：

- **切片 A·包管切 pnpm（实证成立·已回退）**：`pnpm-workspace.yaml`（packages: apps/*,libs/*）+ `.npmrc`（npmmirror）。**R-α 证伪**——isolated 严格布局下 `pnpm run build:nest` 148 文件·TSC 0、`pnpm run test` **343（327/16）零掉**、DI/装饰器回归全绿、`@core/saas-kit` workspace 链接正常。唯一必需配置=`allowBuilds` 放行 `@swc/core`+`esbuild`（pnpm 11 默认拦 postinstall）。另拓 `.gitignore` L38 忽略 `.npmrc` → registry 不可复现（待修）。
- **切片 B·运行时/脚本切 Node（已回退）**：`package.json` scripts bun→node/tsx、`engines.node>=22`、`packageManager=pnpm@11.7.0`、`main`+`start:prod` 校正至真产物 `dist/apps/api/src/main.js`（原 `dist/main.js` 系先于本迁移的失真）。`pnpm add -Dw tsx`。
- **切片 C·ci.ts 去 `bun:shell`（已回退）**：`import { $ } from 'bun'` → `node:child_process.spawn(cmd,{shell:true,stdio:'inherit'})`；`Bun.version`→`process.version`；fallow `pnpm dlx fallow@3.33.1` 三态非阻断。`pnpm run ci` → **Local CI PASSED**（343·fallow advisory）。
- **切片 D·hooks/Docker/GHA（已回退）**：husky 三钩子 `bun run`→`pnpm run`/`pnpm exec`；Dockerfile base `node:22-slim`（DaoCloud 镜像 ARG）+corepack+`pnpm install --frozen-lockfile`+`CMD node dist/apps/api/src/main.js`；deploy-swagger.yml `setup-bun`→`setup-node@v4`。
- **运行时起服实证→拓出 R-δ（本案终结性发现·见 §3）**：`node dist/apps/api/src/main.js` 崩 `ERR_MODULE_NOT_FOUND dist/libs/core/src/…request-context.js`。CI 绿掩盖不得 prod。**判定为架构级新边界·越出“自裁 5 参数”·按铁律停手、回退、归人裁。**

**请裁三选一（归人）**：
- **A · 维持 Bun·放弃本案**：R-δ 说明本仓 `@core/*` 直引 TS 源的架构强依赖 Bun 宽松解析；若无硬约束驱走 Node，保持现状零风险。B 案标 `搁置`。
- **B · 批准多包构建重设计·扩本案范围**：先立项把 `libs/core` 改成独立可编译包（exports 指 dist·句柄规格化·或 nest build 同编两树），跨过 R-δ 后再重推工具链切换。blast radius 升为“工具链 + 构建架构”双全局。需新一轮审计门。
- **C · 折中**：先单独做“多包构建规范化”（Bun/Node 两运行时均受益·修 prod 假绿债）作为前置独立片，完成后再回评本案是否还需启动。

> **建议：C**——“@core/* 直引 TS 源”是独立于运行时切换的真实技术债（现仅靠 Bun 宽松解析 + Vitest tsconfigPaths 两个“宽松”兼容层支撑 prod 假绿）；无论是否换 Node，规范化多包构建本身有独立价值，且完成后使本案风险面大幅收敛。

## 4.6 人裁 B：多包构建重设计并入本案（**待新一轮审计门 · 高危签核**）

> 人于 2026-10-15 裁 **B**（将 R-δ 多包构建重设计并入本案·双全局·需新一轮完整审计门）。本小节为待审设计，**未过审计门零代码**。

**构建现状实锤（本轮勘察）**：
- `nest build --builder swc`（sourceRoot=`apps/api/src`）**只编 apps** → `dist/` 仅 `dist/apps/api/src/**`，**无 `dist/libs`**（已实测）。
- SWC 把 75 个 apps/api 生产文件的 `@core/*`（tsconfig 路径别名·**非包名 `@core/saas-kit`**）重写为相对路径 + `.js`→ 指向不存在的 `dist/libs/core/src/*.js`。
- `libs/core`：55 生产 ts + barrel `index.ts`；`package.json` main/exports 均指 `src/*.ts`（Bun/dev 可、编译后 Node 不可）。
- **后果（纠正后）**：编译产物 prod 在 **Bun 与 Node 下都跑不通**——先于本迁移的潜伏债。

**设方案候选（归人择一签核）**：
- **设计一·同编两树入 dist（低改动）**：新增 `libs/core` 独立构建步骤，输出对齐 `dist/libs/core/src/**.js`（与 SWC 相对重写假设一致）→ 75 个 import 不动。优：零源码句柄 churn·Bun/Node 同时修好。缺：双阶段构建编排 + 依赖编译期路径数学与输出目录严格对齐（脆弱耦合）。
- **设计二·`libs/core` 独立成包 + exports 指 dist + 句柄规格化（推荐）**：`libs/core` 编译至 `libs/core/dist/**.js`，`package.json` `exports` 指 dist（`"./*": "./dist/*.js"` pattern 支持无扩展深子路径解析）；apps/api 侧 `@core/x` 由路径别名改为经 workspace 链解析到包（或改 `@core/saas-kit/x` 包子路径·涉 75 文件句柄）；与 S10/P2 “物理分包、core 独立可构建”目标同构。优：架构干净·无脆弱路径数学·Bun/Node 一致真解·prod 债根治。缺：句柄 churn（若走包子路径）· isolated 布局下需复验（紧回切片 A）。
- **推荐：设计二**（与既有架构目标 S10 P2 一致、真解耦、不靠脆弱的相对路径数学对齐）。但若优先修 prod 债、最小 churn → 设计一可作过渡。

**下一步（审计门签核前）**：需定（一）选哪个设计；（二）新片切片划分与完成判据；（三）高危登记（改构建链 = blast radius 双全局）。

## 4.7 设计二 v0.5 详案（**人择设二·待最终审计门·未过零代码**）

> 人于 2026-10-15 择 **设计二**。本小节为可直接实现的**决策完备**详案，经最终审计门放行后方动码。

**额外现状实锤**：`libs/core` 内部也有 **20 处 `@core/*` 裸句柄自引用**（与相对 import 混用）；apps/api `main` 仍为失真的 `dist/main.js`；根 workspaces=[apps/*,libs/*]；vitest 靠 `resolve.tsconfigPaths` 解析。

**切片（S0→S5·每步实证门禁）**：
- **S0·回归防线（先证“prod 已坏”为真 bug）**：新增最小核验步 `verify:prod-boot`（构建后真起服 + `/api/v1/health`）。**基线上即红**（复现 `ERR_MODULE_NOT_FOUND`）——锁定“修复”的失败测试。判据：旧产物 FAIL · 修复后 PASS。
- **S1·`libs/core` 独立构建**：先剥 core 内 20 处 `@core/*` 自引用→**包内相对路径**（包不应走自己包名）；新增 core 构建（SWC·保 `emitDecoratorMetadata`·目录结构不劣）产 `libs/core/dist/**.js`+`.d.ts`；`exports` 改指 dist（`".":"./dist/index.js"`、`"./*":"./dist/*.js"`）。判据：core 单编产出 dist·`tsc --noEmit` 0·grep 坐实 core 内零 `@core/*` 裸句柄。
- **S2·apps/api 消费切包句柄**：75 生产文件（+相关测）`@core/x` → **包子路径 `@core/saas-kit/x`**（biome codemod + 人工核验·防回吸）；app tsconfig `@core/*` paths 仅供 typecheck 指 core dist `.d.ts`，不再参编译期重写；运行时经 workspace 链 `node_modules/@core/saas-kit`→exports dist 解析（isolated 链已由切片 A 证）。判据：编译产物 import 落地为 `@core/saas-kit/…` 裸包句柄（非相对指 src）·343 零掉。
- **S3·构建编排**：`build:libs`（先编 core）→`build:nest`（再编 app）；root scripts + Dockerfile + ci.ts 串接。判据：端到端产出可运行 dist。
- **S4·prod 起服实证（本案验收命门）**：`node dist/apps/api/src/main.js` 真 listen + `/api/v1/health` 200 存照；**Bun 下同样验**（`bun dist/…/main.js` 亦 200，证 prod 债根治、与运行时无关）。判据：两运行时 prod 起服 200 + S0 转绿。
- **S5·回到运行时主线**：S1–S4 绿后 R-δ 消解，重推原切片 B/C/D（工具链 Node 化）+ E（删 bun + 宪法成文·高危·人签核）。

**高危登记（workflow §3）**：✅ 改构建链（双全局）✅ 句柄 codemod 跨 75+20 文件✅ `libs/core` exports 公共契约变更✅ `docs/specs` 宪法（S5）——均需人签核。
**新风险**：**R-ε** Node ESM 严格下 exports pattern 能否把无扩展深子路径 `@core/saas-kit/shared-kernel/…` 正确映射到 `dist/*.js`（需实机验）·**R-ζ** 跳包 DI：app 注 core service 时 `design:paramtypes` 跨包边界是否仍解析（§4.3 坑延伸至 core 内部·`di-context.integration` 须锁）。

## 5. 完成判据（过审计门后·可核验 + 穷尽）

- [ ] 切片 A：`pnpm install` 成功 + 布局解析方案定档（isolated 或 hoist 兜底）写进 tooling
- [ ] 切片 B：`pnpm run start:dev` 起服·`/api/v1/health` 200 实机存照
- [ ] 切片 C：`pnpm run ci` full/quick 与旧 `scripts/ci.ts` 逐步等价（含 fallow advisory 不阻断语义）
- [ ] 切片 D：`docker compose` 健康检查过 + Actions dry-run 过
- [ ] 切片 E：`docs/specs` §1/§2/§2.1/§3 + `AGENTS.md` §2/§3 同步·无残留 Bun 现行口径（演变记录除外）
- [ ] `bun`→`node/pnpm` 全链 `pnpm run ci` 全绿·**343 测试基线零掉**（gated e2e 真库 Node 复跑一致）
- [ ] DI/元数据回归测（`design:paramtypes`/`app.module.test`/`di-context.integration`/`three-layer-permission.matrix`）全绿（证明 §4.3 未回退）
- [ ] `bun.lock`/`bunfig.toml` 删除、`pnpm-lock.yaml`/`pnpm-workspace.yaml`/`.npmrc` 就位并被 Git 追踪

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-15 | 0.1.0 | 人取向"是否换回 Node+pnpm" + AskUserQuestion 裁"运行时修宪（未勾 ORM）·更新勘察文+出 B 案" | 首版·候选稿·待审计门。含 R1 订正澄清（换 Node 与 v7 无关）、5 片 expand–contract 路线、三项高危登记、R-α/β/γ 风险、未决项 1–5 |
| 2026-10-15 | 0.2.0 | 人以「照建议自裁」过审计门 + 切片 A 开工实证 | 审计翻**已审计·开工**；五未决项据实自裁（Node≥22 / pnpm@11.7.0 / SWC 沿用 / **isolated**无需 hoist / ORM 排除）；**R-α 证伪**（343 零掉）；新增唯一摩擦点=`allowBuilds` 放行 @swc/core+esbuild |
| 2026-10-15 | 0.3.0 | 切片 B/C/D 落地 + 运行时起服实证拓出 **R-δ**（架构级新边界）→ 按铁律停手回退 | §3 新增 R-δ（终结性发现·@core 裸句柄直引 TS 源·CI 绿≠prod 起服可跑）；新增 §4.5 实证进展（切片 A–D 均落地后回退·仅留记录）与请裁三选一（A 维持 Bun / B 批准多包构建重设计 / **C 折中·建议**）；状态转**进行中·受阻 R-δ·待裁**；代码/config 全量回退至绿色 Bun 基线 |
| 2026-10-15 | 0.4.0 | 人裁 **B**（多包构建重设计并入案）+ 实机复测发现 **R-δ 非 Node 专属（Bun prod 产物同坏）** | §3 R-δ 定性纠正：编译产物 prod 在 Bun/Node **都跑不通**·先于本迁移的潜伏债·“A 维持 Bun 零风险”作废；新增 §4.6 待审设计（现状实锤：nest build 只编 apps、dist 无 libs、75 生产文件走 @core/* 路径别名）+ 设计一（同编两树）/设计二（libs/core 独立成包+exports 指 dist·**推荐**）；状态转**待新一轮审计门·高危签核** |
| 2026-10-15 | 0.5.0 | 人择 **设计二**（libs/core 独立成包）·要求先出可审详案 | 新增 §4.7 设计二 v0.5 决策完备详案：额外实锤（core 内 20 处 `@core/*` 自引用）+ 切片 S0（回归防线·基线即红）→S1（core 独立构建·exports 指 dist）→S2（app 75 文件句柄切包子路径）→S3（构建编排）→S4（两运行时 prod 起服实证）→S5（回工具链主线）；高危四项 + 新风险 R-ε/R-ζ；**待最终审计门放行** |

---

<!-- 变更戳 -->
正文已于 2026-10-15 / v0.5.0 变更，以当前正文内容为准。
