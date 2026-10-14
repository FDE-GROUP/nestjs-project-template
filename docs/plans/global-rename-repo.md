# 技术方案 · 仓库更名 nestjs-project-template → nestjs-saas-start

> 状态: **已验收·结项**（人直令 2026-10-14·执行即授权）
> blast radius: **external**（GitHub 仓库 rename + Pages URL 变）+ 仓内展示名 13 处

## 1. 裁决与执行

- 人直接指令：GitHub 仓库更名 `nestjs-saas-start`（当前指令为最高权威层级，免呈审）。
- `gh repo rename`（ADMIN 权限经 `gh repo view` 验证）→ 本地 `git remote set-url`。
- 仓内引用同步：根 `package.json` name + `bun.lock` name 字段 + `docs/specs/tooling-standards.md` 适用仓库注 + `.env.example` APP_NAME + workflow APP_NAME 默认值 + config envs 三层（default/development/production 的 app.name 兜底与 swagger title/description，顺带统一了 `"Nest JS"` 怪拼写）。
- 验证：两种拼写（`nestjs-project-template` / `Project Template`）全仓零残留（历史 plans/research 除外）；CI 276/10 基线不动（无测试断言展示名）；build 过。

## 2. 影响面如实登记

- **旧 URL 重定向**：GitHub 对 rename 保留 redirect（clone/push/API 暂继续可达），但组织内一旦新建同名旧仓库即断——新 URL 为准。
- **Pages URL 变更**：`fde-group.github.io/nestjs-project-template` → `…/nestjs-saas-start`（gh-pages 分支随仓库走，指向旧 Pages 的外部链接失效）。
- **本地目录名未动**：`/home/abel/EA/nestjs-project-template` 保持（改目录会断 IDE 会话上下文，由人自行择机 rename）。
- **真实 `.env` 未碰**（铁律：Agent 不改 `.env`）：若其内 `APP_NAME` 为旧值，本地运行 swagger 标题仍显示旧名，请人自行更新。

## 3. 审计记录

- 2026-10-14 v0.1: 人直令执行，本文件为事后留痕（执行面 + 影响面）。
