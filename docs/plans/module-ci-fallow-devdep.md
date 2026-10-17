# 技术方案 · fallow 收编为 devDependency（修 `pnpm dlx` 原生二进制解析缺失·advisory 定位不变）

> 适用范围: `模块(ci / tooling 面)`——附带触 `docs/specs/tooling-standards.md` 宪法措辞（见 §3 高危）← blast radius 决定审计深度与授权粒度（`workflow.md` §3/§5）
> 关联: `specs/tooling-standards.md` §3 / §4.7 / §4.8 / §4.10 · `scripts/ci.ts:54` · 根 `package.json` devDependencies · `.npmrc`（npmmirror）
> 性质: 新立·小片（依赖/registry 收编 + 取证）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**现状取证（本轮实测坐实）**
- 本地 CI 的 fallow 佐证步骤经 `pnpm dlx fallow architecture` 调用（[ci.ts:54](../../scripts/ci.ts)），输出：`Could not find @fallow-cli/linux-x64-gnu. Run 'npm install' to install the platform-specific binary.`——fallow 运行时加载不到**原生平台二进制包**，佐证信号实质降级为「空跑」（但 ci.ts 打印 `⚠` 告警、非静默，且按设计不阻断）。
- fallow **不在依赖树**：`pnpm-lock.yaml` 无条目、`node_modules/.pnpm` 无安装，纯靠 dlx 每次临时拉取。
- 注册表现状：`@fallow-cli/linux-x64-gnu` 在 **npmmirror 与 npmjs 官方源均返回 HTTP 200**（包文档存在）；`.npmrc` 全局 registry = `registry.npmmirror.com`（§6 地域约束）。故缺失**非「镜像无此包」**，而是 dlx 的临时安装**未落实 fallow 声明的 optional 原生平台包**（os/cpu 门控的 napi 预编译件）——**确切根因待切片 A 实证**（不臆断）。

**目标**
1. 让 fallow 的原生二进制**可被正常解析**，恢复 `fallow architecture` 的真实边界佐证输出。
2. 手段：把 fallow 从 dlx 临时调用**收编为项目 devDependency**，由 `pnpm install` 走正常依赖解析（含 optionalDependencies 的平台件），CI 改用 `pnpm exec fallow`。
3. 评估 **npmmirror 镜像 + `.npmrc` 配置对原生二进制（optional 平台包 tarball）的支持度**，得出「镜像够用 / 需为 `@fallow-cli` scope 覆写 registry」的结论并落文档。

**非目标**
- ❌ **不改 fallow 的 advisory 定位**——仍为非阻断佐证（ci.ts 三种退出码全部仅告警、不入 `failed`；结论仍须二次人工核验，§4.7 铁律原样保留）。
- ❌ 不改任何生产代码 / 运行时依赖 / 部署面。
- ❌ 不借机重跑全量 fallow 分析或据其删码（那属另片高危动作）。

## 2. 方案（切片）

- **切片 A · 根因取证（spike·零仓库变更）**——完成判据：
  1. 临时把 `fallow@3.33.1`（版本对齐 tooling-standards §3 表）加入 devDependencies → `pnpm install` → 断言 `node_modules/.pnpm/@fallow-cli+linux-x64-gnu*` 是否落地、`pnpm exec fallow architecture` 是否产出**真实边界报告**（非 missing-binary）。
  2. 实测 dlx 失败确切原因（optionalDependencies 是否被 dlx 跳过 / pnpm 的 `supportedArchitectures` 门控 / 平台件 tarball 是否需 `--registry` 覆写）。
  3. 取此结论后再进切片 B；**取证用的临时 package.json/lockfile 改动若不成方案即回退**，不带病落地。
- **切片 B · 收编落地（触高危 #2·人签核后）**——完成判据：
  1. `package.json` devDependencies 固化 `fallow@^3.33.1`；`pnpm install` 更新 lockfile（含平台件解析结果）。
  2. `scripts/ci.ts` 将 `run('dlx', 'fallow', 'architecture')` 改为 `run('exec', 'fallow', 'architecture')`（或新增 package.json 脚本 `fallow:arch` 供 `run('run', …)` 消费）；advisory 分支逻辑（exit 0/1/其他都不置 `failed`）**逐字不动**。
  3. 若切片 A 证实 npmmirror 对 `@fallow-cli` 平台件 tarball 支持不足 → 追加 `.npmrc` scope 覆写 `@fallow-cli:registry=https://registry.npmjs.org`（**逐条评估、能靠镜像就不覆**）。
  4. 宪法同步（若签核·触高危 #5）：`tooling-standards.md` §4.7 line 125「统一经 `pnpm dlx fallow`」与 §4.8 本地 CI 口径**改为「经 devDependency + `pnpm exec fallow`」**；§3 依赖表「推荐（经 `pnpm dlx`）」列同步。**未过审计门不得先改宪法。**
- **切片 C · registry 支持度结论成文**——完成判据：把「npmmirror 是否原生服务 optional 平台二进制、是否需 scope 覆写、CI/容器/新成员首装的 reproducibility」结论写入本 plan §5 或 tooling §4.10 邻注，供后续复用（防重演 dlx 空跑的静默退化）。

## 3. 影响面与风险

- **高危 #2（改依赖）**：新增 devDependency + lockfile churn（含原生平台件条目）。
- **高危 #5（改宪法 / 公共口径）**：本方案**直接冲突** `tooling-standards.md` §4.7 line 125 现文「统一经 `pnpm dlx fallow`（遵守 §3 禁 bun/npm/yarn 红线），不直接用 npx」与 §4.8「随后 `pnpm dlx fallow architecture` 作佐证」——收编为 devDependency 需**同步修宪**，否则口径自相矛盾。**修宪归人签核，Agent 不得自行改 `docs/specs`。**
- **可逆性**：高。回滚 = revert `package.json` + `ci.ts` 一行 + lockfile 变更 +（若已改）宪法措辞，净退；无 schema、无生产面。
- **风险登记**：
  - lockfile 新增平台件跨机器/跨架构（linux-x64-gnu vs darwin-arm64 等）解析差异——切片 A 需确认 CI 环境（GitHub Actions ubuntu runner）与本地一致可得。
  - `pnpm install` 供应链面：npmmirror 拉取原生 tarball 的完整性（§4.10 精神：以实跑为准，非「配置就位」）。
  - **advisory 语义不得漂移**：改 exec 后仍须保证 fallow 缺失/报错不使 `pnpm run ci` 失败（现 ci.ts 已如此，逐字保留即安全）。

## 4. 审计记录（已裁·人授权自裁）

> 无已审方案不写码。本 plan 触高危 #2 + #5。

- **结论**：**已审计**（人「你自行裁定」＝授权 Agent 自裁·高危 #2（依赖）+ #5（修宪）随此授权签核）。**关键消歧**：`tooling-standards.md` §4.7 line 128 原文已预写「若需 CI/本地同版本，应固定为 devDependency 并在 `package.json` 写精确版本」——本片是**执行宪法既有推荐**（口径对齐），非新引入宪法冲突；#5 风险降为 dlx→exec 的现行口径归一。
- **未决项裁定**：
  1. **甲 · 修宪范围**＝**采「同步改口径」**：`tooling-standards.md` §3 表 / §4.7（调用方式·入口命令·架构边界·版本一致性）/ §4.8 本地 CI / `workflow.md` L2 行 / 根 `README.md` 均将 `pnpm dlx fallow` 归一为 `pnpm exec fallow`；advisory 非阻断与二次人工核验铁律**原样保留**。
  2. **乙 · registry 策略**＝**镜像够用·不覆写**：取证坐实 npmmirror 缺 `@fallow-cli` 3.33.1 平台件（仅到 3.33.0）→ 取 **3.33.0** 精确钉（主包+平台件镜像齐），**不**将 `@fallow-cli` scope 覆写 npmjs，守 §6 境内优先。
  3. **丙 · 调用形态**＝**封装 package.json 脚本 `fallow:arch`**（命令面 SSOT·ci.ts `run('run','fallow:arch')`）。
- **审计人 / 日期**：人授权自裁 · 2026-10-17

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A 取证留痕：**根因订正——非 dlx 特有**，而是 npmmirror 未同步 `@fallow-cli/*` 3.33.1 平台件（仅到 3.33.0）使 optionalDependencies 整组解析失败被跳过（dlx 与 devDependency@3.33.1 同因报 missing-binary）；devDependency@**3.33.0** 下 `pnpm exec fallow architecture` 产出真实报告 `✓ No issues found` EXIT=0。
- [x] `fallow` 进 devDependencies（精确钉 `3.33.0`·无 `^`）+ lockfile 更新（主包 + 8 平台件 + type-aware均 3.33.0·无 3.33.1 残留）；本地 linux-x64-gnu 实跑平台件已落地。
- [x] `scripts/ci.ts` fallow 步骤改经 `fallow:arch` 脚本（= `pnpm exec fallow architecture`）·**advisory 非阻断语义逐字不变**（exit 0/1/其他均不置 `failed`）。
- [x] registry 支持度结论成文（npmmirror 缺 3.33.1 平台件·够用档=3.33.0·不覆写 scope·镜像补齐后可升版）——已写入 `tooling-standards.md` §4.7「版本一致性」。
- [x] 改宪：`tooling-standards.md` §3/§4.7/§4.8 + `workflow.md` L2 + 根 `README.md` dlx→exec 口径同步·无现行口径残留（历史执行记录如 global-runtime-node-pnpm 保留原文）。
- [x] `pnpm run ci` 全绿：硬门禁 check→build→test **481/30 基线不动（只增不减）**·fallow 步骤输出 `✓ No issues found`（非 missing-binary 空跑）。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 起草 | 首版：dlx 原生二进制缺失取证坐实（missing-binary·镜像 200·非项目依赖）；三切片（取证/收编/registry 成文）；点明触高危 #2 依赖 + #5 修宪（§4.7 line 125 dlx 口径冲突）；advisory 定位不变列非目标。§4 甲乙丙待裁。 |
| 2026-10-17 | 0.2.0 | 人「你自行裁定」→ Agent 自裁甲乙丙并实现落地 | **根因订正**：slice A 实测发现非 dlx 特有——npmmirror 缺 `@fallow-cli` 3.33.1 平台件（仅到 3.33.0），dlx 与 devDependency@3.33.1 同因报 missing-binary。**取镜像够用档 3.33.0**（非 npmjs scope 覆写）解决。落地：package.json devDep `fallow@3.33.0`（精确·无 `^`）+ `fallow:arch` 脚本·ci.ts dlx→exec·宪法 §3/§4.7/§4.8 + workflow L2 + README dlx→exec 口径归一（发现 §4.7 line 128 宪法已预写 devDependency 路线·本片为执行既有推荐）。验收 `pnpm run ci` 全绿 **481/30 基线不动**·fallow 真实产出 `✓ No issues found`。高危 #2/#5 随人「自行裁定」授权。 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 变更，以当前正文内容为准。
