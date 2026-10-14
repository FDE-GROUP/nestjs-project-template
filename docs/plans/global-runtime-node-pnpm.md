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
- **收益诚实面**：生态对齐/风险姿态是**长期**收益，非即时功能收益；切换期净成本 = 5 片工具链重写 + 全链重验。npmmirror 境内镜像 pnpm 同样支持，**镜像不构成理由**。

## 4. 审计记录（待审 · 呈人）

> 无已审方案不写码。本案全局 + 不可逆 + 命中三项高危 → **人签核**。

- **结论**：待审计。技术前提已澄清（换 Node 与 v7 无关·纯工具链），价值主张独立成立但属长期收益，成本已量化（5 片 + 全链重验）。
- **未决项（须人逐裁·Agent 不自裁）**：
  1. **Node LTS 版本基线**（22.x 还是 24.x？`engines.node` 精确范围）。
  2. **pnpm 版本** + `packageManager` 锁定串。
  3. **构建后端**：沿用 SWC（`nest build --builder swc`·§4.3 坑保留）还是转 tsc（另一轮 builder 迁移·更大半径）？本案默认**沿用 SWC**。
  4. **包管严格度**：pnpm 默认 isolated vs `node-linker=hoisted`——依切片 A 实测结果定档并写进 tooling。
  5. **是否顺带采纳 ORM 案**：人本轮**未勾 ORM**，故 ORM 不在本案范围；若未来二者叠加执行，须重估顺序与合并 blast radius。
- 审计人 / 日期：______ / ______

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

---

<!-- 变更戳 -->
正文已于 2026-10-15 / v0.1.0 变更，以当前正文内容为准。
