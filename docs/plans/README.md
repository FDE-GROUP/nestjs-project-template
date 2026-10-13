# 技术方案索引（plans）

> 本区是**开发依据**（`docs/specs/workflow.md` §2）。plan = 方案单位；带**审计**与**执行状态**。
> 状态**单源**在本索引表——**各 plan 文档头不重复标状态**（单标记防漂移）。
> 方案完成后**留原地、不归档**（`recycle/` 只收弃用稿）。

## 索引

| Plan | 主题 | 审计 | 执行状态 | 关联 |
|------|------|------|----------|------|
| [global-tenancy](./global-tenancy.md) | 多租户能力（技术方案 v0.9.0 · 已审计） | 已审计 | 进行中（**S0/S1/S2/S3 已落地**：S0 eafab76+c73e254 org 三表+插件+ALS·D4；S1 f310cfc 租户级 RBAC（委派 BA hasPermission）；S2 post+organizationId（0004）+TenantScopeGuard fail-closed+仓储层唯一隔离卡点+越界回归单测；S3 0747efc workspace 表+post.workspaceId+复合索引（0005）+x-workspace-id 选择器+复合作用域隔离（跨租泄漏结构不可能）+互不可见回归单测；下一步 S4 审批制租户生命周期） | `specs/vision.md` §4.1/§7 · `research/better-auth-org.md` · `specs/glossary.md` · global-cn-adaptation PaymentProvider/D9 |
| [global-cn-adaptation](./global-cn-adaptation.md) | 中国大陆地域适配（技术方案 · 已审计） | 已审计 | 进行中（M1/L1・全量(A+B)/G1/S1/P1/A1/C1/C2 ✅；A2/A3 仅留接口·暂缓 D8；P2/P3 劣后暂缓 D9） | `specs/vision.md` §4.3/§6 · global-tenancy FR-8/D5 · `research/better-auth-cn-providers.md` |
| [event-sourcing-roadmap](./event-sourcing-roadmap.md) | 事件溯源路线（技术方案 · 递延） | 待审计 | 未开工 | `specs/architecture.md` · `specs/vision.md` §7 |

**列取值**
- **审计**：`待审计` / `已审计`（无已审方案不写码——`workflow.md` §3）
- **执行状态**：`未开工` / `进行中` / `已完成` / `搁置`
- **关联**：`specs/*` 条款 · GitHub Issue · `research/*` 参考

## 命名

`<global|module>-<slug>.md`（`适用范围` = blast radius，决定审计深度与授权粒度）；例：`module-users-es-append.md`、`global-ci-hardening.md`。

新建 plan：复制 [`_template.md`](_template.md) 起。
