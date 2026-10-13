# 技术方案索引（plans）

> 本区是**开发依据**（`docs/specs/workflow.md` §2）。plan = 方案单位；带**审计**与**执行状态**。
> 状态**单源**在本索引表——**各 plan 文档头不重复标状态**（单标记防漂移）。
> 方案完成后**留原地、不归档**（`recycle/` 只收弃用稿）。

## 索引

| Plan | 主题 | 审计 | 执行状态 | 关联 |
|------|------|------|----------|------|
| [global-tenancy](./global-tenancy.md) | 多租户能力需求（草案 · pre-plan） | 待审计 | 未开工 | `specs/vision.md` §4.1/§7 |
| [global-cn-adaptation](./global-cn-adaptation.md) | 中国大陆地域适配（技术方案 · 已审计） | 已审计 | 进行中（M1/L1mailer・全量/G1/S1/P1/A1/C1/C2 ✅；A2/A3 仅留接口·暂缓 D8；P2/P3 劣后暂缓 D9；L1 校验本地化递延） | `specs/vision.md` §4.3/§6 · global-tenancy FR-8/D5 · `research/better-auth-cn-providers.md` |
| [event-sourcing-roadmap](./event-sourcing-roadmap.md) | 事件溯源路线（技术方案 · 递延） | 待审计 | 未开工 | `specs/architecture.md` · `specs/vision.md` §7 |

**列取值**
- **审计**：`待审计` / `已审计`（无已审方案不写码——`workflow.md` §3）
- **执行状态**：`未开工` / `进行中` / `已完成` / `搁置`
- **关联**：`specs/*` 条款 · GitHub Issue · `research/*` 参考

## 命名

`<global|module>-<slug>.md`（`适用范围` = blast radius，决定审计深度与授权粒度）；例：`module-users-es-append.md`、`global-ci-hardening.md`。

新建 plan：复制 [`_template.md`](_template.md) 起。
