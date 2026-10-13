# 技术方案索引（plans）

> 本区是**开发依据**（`docs/specs/workflow.md` §2）。plan = 方案单位；带**审计**与**执行状态**。
> 状态**单源**在本索引表——**各 plan 文档头不重复标状态**（单标记防漂移）。
> 方案完成后**留原地、不归档**（`recycle/` 只收弃用稿）。

## 索引

| Plan | 主题 | 审计 | 执行状态 | 关联 |
|------|------|------|----------|------|
| [global-tenancy](./global-tenancy.md) | 多租户能力（技术方案 v0.16.0 · 已审计） | 已审计 | 进行中（**S0/S1/S2/S3/S4/S5/S6/S7/S8/S9 已落地**：S0 eafab76+c73e254 org 三表+插件+ALS·D4；S1 f310cfc 租户级 RBAC（委派 BA hasPermission）；S2 post+organizationId（0004）+TenantScopeGuard fail-closed+仓储层唯一隔离卡点+越界回归单测；S3 0747efc workspace 表+post.workspaceId+复合索引（0005）+x-workspace-id 选择器+复合作用域隔离（跨租泄漏结构不可能）+互不可见回归单测；S3 补完 09496f1 workspace CRUD 参考切片（扩 BA ac 增 workspace 资源·read=全成员/write=owner+admin·roles 整组镜像叠加）；S4 971cd7c 审批制租户生命周期（封自助开通 allowUserToCreateOrganization=false·状态存 organization.metadata 无迁移·申请/审批/驳回 CQRS·TenantMiddleware deny-list 失能）；S5 1f773cd 平台经营者治理（PlatformOperatorGuard 收敛为 email 命中 platform.operatorEmail·config/seed 对齐·canTransition 迁移表+transition 严格裁决·跨租列表/详情/诊断+suspend/resume/delete CQRS·PlatformAuditService 结构化审计单点·无 schema 不触 migrate）；S6 10157e9 fail-closed 平台用户暂停（新独立表 user_status（0006 纯additive·FK 级联）+UserStatusService 读写卡点·三层失能统一经 isBlocked（中间件/SessionGuard/PlatformOperatorGuard）+suspend 硬删 session+跨平台用户列表+PlatformUsersController·真库 push 口径直执 0006）；v0.12.1 迁移口径定档+dev 库漂移修复（consent/schema 漂移经清库→migrate(0000→0006)→seed 重建为 journal 一致态·无代码变更·口径入 install&run.md）；S7 订阅/配额挂钩（新表 tenant_subscription（0007 纯additive·14列·FK cascade·1:N 历史·已 migrate apply）+tenant-plans/QuotaService 读写单点（assertSeats 超限 402·缺订阅回落 FREE_PLAN）+@Quota/QuotaGuard（opt-in 逐路由·不挂全局 APP_GUARD）+src/modules/subscriptions CQRS（create 实调 PaymentService.createCustomer 落 providerCustomerId·PaymentModule @Global）·真库往返验证+修 repo updatedAt bug·CI 216）；S8 三层权限收口（FR-11·人裁 B 务实收口·无 schema 变更不触 migrate）：据实盘点三层已收敛（SessionGuard/TenantScope+TenantPermission→BA hasPermission 单源/PlatformOperatorGuard→email 单点·isBlocked 统一）+全仓 grep 坐实无散点硬判；新增 session-resolver.ts 单认证解析面（三处守卫复用·每请求一次 getSession）+ three-layer-permission.matrix.test.ts 互不授予/fail-closed/校验顺序矩阵·未接全局 APP_GUARD·CI 226）；S9 DI/上下文集成测试（NFR-7·新建 di-context.integration.test.ts 首次把整条鉴权栈放进真实 Test.createTestingModule·**拓出已编译入产的真 bug**：TenantScope/TenantPermissionGuard 构造参 import type+无 @Inject token→swc 发 design:paramtypes=[Object]→Nest 无法实例化守卫·@UseGuards 路由启动即崩（历片手工 new+CI 无真 boot 未暴露）→修复为显式 @Inject(ClassToken)+值导入防 biome 回吸·回归测锁 design:paramtypes/DI 解析/ALS 端到端三层·CI 232）；**S9 补遗·全栈 e2e 分层收口（v0.16.0·收 S2–S6「全栈 e2e」挂账）**：第一层 app-boot.smoke.test.ts（DB-free·override DrizzleService·compile 整树 DI 不触发 onModuleInit·入默认 CI·**顺带拓两个真 prod boot bug**：ConfigModule 原非 @Global→加 @Global；QuotaGuard 三参 import type 无 token→值导入+@Inject·同 S9 bug 类）+ 第二层 env-gated tenant-isolation.e2e.test.ts（真守卫/中间件/CQRS/仓储/Fastify·仅 getSession 边界打桩·真 HTTP 打穿 /posts 断言跨租户互不可见·无 E2E_DATABASE_URL 默认 skip·vitest.config DATABASE_URL 改外部可覆盖）·CI 236（3 gated skip）·无 schema 不触 migrate·未接全局 APP_GUARD·真实 BA 登录编排留「全栈 CI 拼 PG」专项；下一步 S10 两包拆分（口径预裁「边界先行·仅抽 core」）） | `specs/vision.md` §4.1/§7 · `research/better-auth-org.md` · `specs/glossary.md` · global-cn-adaptation PaymentProvider/D9 |
| [global-cn-adaptation](./global-cn-adaptation.md) | 中国大陆地域适配（技术方案 · 已审计） | 已审计 | 进行中（M1/L1・全量(A+B)/G1/S1/P1/A1/C1/C2 ✅；A2/A3 仅留接口·暂缓 D8；P2/P3 劣后暂缓 D9） | `specs/vision.md` §4.3/§6 · global-tenancy FR-8/D5 · `research/better-auth-cn-providers.md` |
| [event-sourcing-roadmap](./event-sourcing-roadmap.md) | 事件溯源路线（技术方案 · 递延） | 待审计 | 未开工 | `specs/architecture.md` · `specs/vision.md` §7 |

**列取值**
- **审计**：`待审计` / `已审计`（无已审方案不写码——`workflow.md` §3）
- **执行状态**：`未开工` / `进行中` / `已完成` / `搁置`
- **关联**：`specs/*` 条款 · GitHub Issue · `research/*` 参考

## 命名

`<global|module>-<slug>.md`（`适用范围` = blast radius，决定审计深度与授权粒度）；例：`module-users-es-append.md`、`global-ci-hardening.md`。

新建 plan：复制 [`_template.md`](_template.md) 起。
