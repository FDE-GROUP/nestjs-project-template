# 技术方案 · apps/reference 更名 apps/api（命名归行业惯例，语义归文档）

> 状态: **已验收·结项**（人验收 2026-10-14·commit `cf5ceda`）| 读者: **Agent**（历史归档）
> blast radius: **global**（触构建配置全集 + `docs/specs/vision.md` 措辞补注 = 高危#5 随本批呈签）
> 关联: 讨论源起「是否应更名 apps/api-server」→ 取证结论：`reference` 非行业通名（惯例为 `apps/api`/`apps/server`，示例语义惯例位置 `examples/` 或由文档承担）

## 1. 裁决与理由

- 目录名服务**采用者**（fork 即用、零改名、行业熟悉），命名归行业惯例 `apps/api`（短名，非 `api-server`）。
- "参考实现（reference implementation）"是本仓库模板叙事的核心定位，**保留在文档**（vision D6 交付形态表述不动语义，仅补注目录名与叙事的分工），不占用目录名。

## 2. 改动面（全清单·实测 grep 盘点）

- `git mv apps/reference apps/api`；`apps/api/package.json` name `reference-app` → `api-app`
- 配置：`tsconfig.json`（`@app/@modules/@config/@common/@shared` 五条 paths）、`nest-cli.json` sourceRoot、根 `package.json` 五条 scripts（start/start:dev/start:debug/db:seed/openapi:export）、`drizzle.config.ts` schema
- 源码注释 3 处（table-ownership.ts / guard.test / tenant-isolation.e2e.test 的运行命令）
- 文档：`README.md`（架构树 + i18n 路径 + 措辞）、`AGENTS.md` §5、`docs/specs/architecture.md` 附录 L100、`docs/specs/vision.md` 补注（高危#5）
- **免改**：vitest/biome（`apps/**` glob）、Dockerfile/compose（`COPY . .` 无具体路径）、workspaces（`apps/*` glob）；历史 plans/research 文本不回改（照实留痕）

## 3. 风险与回滚

- rename 与引用改必须**同 commit**（防中间态断链）；回滚 = revert 单 commit。
- 验证 = `bun install`（workspace 重链）+ 全量 CI + `bun run build:nest` + codegen 实跑。

## 4. 完成判据（DoD）

- [x] 全仓 grep `apps/reference`/`reference-app` 零残留（实测 0·历史 plan/research 除外）
- [x] CI 全绿 **276/10（基线分毫未动）**·build 过·openapi:export 新路径实跑产物正常
- [x] vision/architecture/README/AGENTS 措辞同步且“参考实现”叙事不丢失（vision D6 补「命名分工」注·README 架构段/AGENTS §5 内嵌说明）
- [x] 提交 + push（pages workflow 新 paths 首跑顺带验证）

## 5. 审计记录

- 2026-10-14 v0.1: 人裁「1、2」= 改 `apps/api` + 文档承担语义；高危#5（vision 补注）随批视同签核。本 plan 即留痕，即刻执行。
- 2026-10-14 v0.2: 交付——git mv + 配置/源码/文档全改单 commit；零残留；CI 276/10 基线不动；workspace 重链（api-app）。待验收。
- 2026-10-14 v0.3: 人验收通过（「同意」）结项。本次 push 同时为 Pages workflow 新触发 paths（`apps/**`）首次源码改动实跑，就绪首切片遗留观察项随之自动验证。
