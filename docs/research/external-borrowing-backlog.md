# 外部借鉴优化清单（softkit-core + brocoders/nestjs-boilerplate 两轮合并）

> 状态: **挂账清单**（research 区·**参考非依据**——每激活项仍须独立过审计门出 plan）| 更新: 2026-10-15
> 缘起: 外部借鉴线两轮评价的净产出统一归档，防止散落对话史。softkit 轮详情见各已结项 plan；brocoders 轮评价结论见本文 §3。

## 1. 激活优先级排序（判据触发制）

| # | 项 | 来源 | 触发判据 | 性质 |
|---|---|---|---|---|
| V1 | ~~反代 IP 信任链 + BA 限流 key 审计~~ **已订正（实码勘定，见 plan v0.1 §4）**：限流 key 走 BA 自有 `advanced.ipAddress.*` 与 Fastify trustProxy 无关；风险本体坐实=生产无可信 IP 时全体用户落 `no-trusted-ip` 共享桶（登录面 3 次/10s 整站误杀）。解法已立项 | brocoders 轮反照 | **已立项 2026-10-14**（[module-auth-ip-trust](../plans/module-auth-ip-trust.md)） | 核验+小实现 |
| V2 | ~~死配置清理~~ 已随 V1 切片立项（实态订正：非全死——有 getter+契约测但零生产消费方，helmet 名实在 main.ts 硬注册） | 同 V1 勘察副产 | 随 V1 切片顺收 | 名实治理 |
| V3 | **改密后其他会话撤销**：BA `change-password` 流程**不自动**踢旧会话（库源码实锤：password.mjs 无 revoke 引用；`revokeOtherSessions` 是独立显式端点）——密码泄露场景下后门会话存活 | brocoders 对照（其 `deleteByUserIdWithExclude` 恰做了这步，照出我方缺口） | 前端入场（用户自助面成型）或安全加固立项时 | 设计决策+实现 |
| V4 | **MikroORM 承载 DDD 持久化 + BA 经 adapter 标准接链**：人取向（"更看重 DDD 贴合度、可考虑修宪"）触发的工具宪法级评估——已勘察（实机 spike v6 全链绿 / v7 与社区 adapter 生态断（class-key 寻址）须自持变体；**初记的 "v7 Bun migrate 断"经复测订正为不实——实为缺 tinyglobby 隐依赖、补装即 Bun 下全绿**，见 [mikro-orm-ddd-feasibility](./mikro-orm-ddd-feasibility.md) v0.2）；修宪与否归人裁 | mikro-orm.io v7 + better-auth createAdapterFactory/test-utils 官方标准 + npm registry 实查 | 人二判勘察文后是否出 B 修宪案——**已出·人裁 Q1＝v7+自持 adapter**（[global-orm-mikro-constitution-amendment](../plans/global-orm-mikro-constitution-amendment.md) v0.4.0·2026-10-16 人裁起草并裁 Q1·切片 0 证据补拍已 Node 重采全绿且 R4 面已补拍结清（organization/additionalFields/quota 功能面绿·test-utils authFlow 8/8·唯 genericOAuth 外部回调 dance 未验）·**审计门已裁＝整案 GO（人授意按建议自裁 2026-10-16·实施逐片仍须高危签核·切片 0 已结清·切片 1 已落地验收（详上表 V4 状态行）·切片 2/3/4 未开工）**·案名由预留的 `tooling-mikro-orm` 订正为本名） | 宪法级评估·修宪高危 |
| V5 | **运行时/包管修宪（弃 Bun → Node+pnpm）**：V4 复测副产——因 R1 订正确立为与 ORM **正交**的独立工具链修宪（换 Node 非 v7 前提）；已实锤全仓零 `Bun.*` API（切换纯工具链层）·已出 B 案 [global-runtime-node-pnpm](../plans/global-runtime-node-pnpm.md)（候选稿·待审计） | 人取向 2026-10-15 + mikro-orm spike 附带取证 | 人过审计门（未决项 Node版本/pnpm严格度/SWC去留）后按 5 切片执行 | 宪法级修宪·高危 ×3（改门禁/改 specs/换依赖布局） |
| B3 | 轻量 `hasNextPage` 分页形态（`rows.length === limit` 免第二发 count）：适合无限滚动 feed（posts），与本仓 `Page<T>`（total 已裁）互补不冲突 | brocoders infinity-pagination | 前端无限滚动需求成型 | 契约衍生小项 |
| B4 | Swagger 文档按受众 groups 出件（admin/公开两套视图）+ OpenAPI 错误契约注解（requestId/errorCode 入文档） | brocoders @ApiProperty groups + softkit swagger decorators | OpenAPI 面建设立项 | 文档面小片 |
| B5 | 资源×角色 API e2e 矩阵形状（其 test/admin/*.e2e-spec 形态）——本仓真会话 e2e 扩面时参考（注意其 0 单测全 e2e 哲学与我方金字塔相反，借形状不借路线） | brocoders 测试布局 | 前端入场 / gated e2e 扩面 | 参考 |
| B6 | BA `sessionCache` 性能旋钮（全有状态会话=每请求 session+status 两查）——撤销实时性当前为正确取舍，QPS 上来后第一优化点 | brocoders "stateless access" 反照 | 前端入场后实测延迟/负载 | 性能挂账 |
| C1 | 租户自助导出 ZIP 异步（bullmq 蓝本） | softkit 轮 | 租户自助导出需求 | 中型片 |
| C2 | readiness 探针（区分 liveness） | softkit 轮（health-probe 片丁裁缓行） | 多实例 / K8s | 判据触发 |
| C3 | 出站弹性（超时/重试/熔断统一设施） | softkit 轮 | 出站调用 ≥3 处 | 判据触发 |
| C4 | traceparent 传播 + pino child 绑定 | softkit 轮 | 分布式 tracing 需求 | 挂账 |
| C5 | errorCode 码表 | 错误契约片（结项登记） | 前端 api-client 立项 | 留待消费方 |
| C6 | port 孤儿方法收编（UserRepository list/findByEmail） | users 面收紧片（结项登记） | 下次 users 域立项顺收 | 小账 |
| C7 | 微服务拆分：跨服务会话校验议题（进程内 guard 形态 → 网关集中解析或 token relay） | 本仓 BA 评价 | §拆包判据触发 | 架构挂账 |

## 2. 两轮借鉴总评（存照）

- **softkit-core**（libs 分层库）：可借面宽——六轮产出结项切片 ×5（health-probe / pagination-contract / correlation / error-contract / pagination-coverage）+ 成文纪律 ×1（tooling §4.9）+ 挂账多段；方法论"借形不借身"全程零反例。
- **brocoders/nestjs-boilerplate**（经典时代应用级 boilerplate）：可借面窄——其立身之本（自研 auth 流程完整度）已被 better-auth 整体接管且我方装配深度反超（组织 RBAC/暂停 fail-closed/服务端编排网关）；双 ORM/flat 分层/0 单测三路线冲突项全部否决留档。**净产出 = 一条半反照式发现**（V1/V3 由它的对照照出，非它的方案本身），印证借鉴线老规矩：被评价仓库的价值上限是"照出我方盲区"。

## 3. 取证索引

- brocoders：v1.2.0 浅克隆实读（auth.service hash=sha256(随机)·jwt.strategy 不查库[docs 自认]·deleteByUserIdWithExclude 实存·infinity-pagination·src 单测 0/test e2e 6）。
- 本仓实码：`auth.module.ts` L46 全局会话墙·`better-auth` 1.7.7 `dist/api/rate-limiter`（默认开·sign-in 路径 3/10s·reset 60s 窗）·`password.mjs` 无自动 revoke·`trustProxy` 全仓零配置·`security.rateLimit` 消费方零。

## 4. 使用规则

- 本表**不是承诺**：任何行激活 = 独立立项过审计门；完成一行在下表翻「已立项/已结项」并链回 plan，**不删行**（账目可追溯）。

| 行 | 状态 |
|---|---|
| V1、V2 | **已立项**（module-auth-ip-trust·人裁"同意，1" 2026-10-14） |
| V3、B3–B6、C1–C7 | 挂账中（截至 2026-10-14） |
| V4 | **已立 B 案·Q1–Q4 均已裁（Q1＝v7+自持 adapter·Q2＝零装饰器+S9 实体面豁免·Q3＝Filters/RLS 暂不采·Q4＝不引 Kysely）·切片 0 证据补拍已 Node 重采全绿·R4 面已补拍结清**（mikro-orm-ddd-feasibility **v0.2**·人裁"同意，A" 2026-10-15·**R1 已订正**；B 修宪案 [global-orm-mikro-constitution-amendment](../plans/global-orm-mikro-constitution-amendment.md) **v0.4.0** 已入 plans 区·**已审计·整案 GO**·实施未开工 2026-10-16；切片 0 pre-audit spike 已在 Node 22+pnpm isolated+真 PG 15 重跑取证（账目见该案 §5.1：R1 消解·迁移链经 `migrator.up()` 绿·R2 桥法绿·BA 三表真行·scratch 已清）·**并已补拍 R4 面（organization/additionalFields/quota 功能面绿·test-utils authFlow 8/8 全绿·normal 失败归合成模型 scope 不匹配·genericOAuth 外部回调 dance 未起 IdP 未验）→ 切片 0 证据面整体结清**·**整案已裁 GO**（人授意按建议自裁 2026-10-16·一致性套件 authFlow 钉为切片 1 验收判据·入 `ci` 硬门禁待切片 1 随实现签核·切片 0 夹具口径追认为惯例·实施逐片仍触高危清单 1/2/3/4 待人逐次明示签核））·**✅ 切片 1 已落地（人签核开工·该案 v0.5.0 2026-10-16）**：本仓真实源码位 `apps/api/src/database/mikro/{entities,orm,mikro-auth-adapter}.ts`——自持 v7 adapter（createAdapterFactory·8 必选 + consumeOne/incrementOne/createSchema + transaction·per-op fork + ALS 事务透传·raw `em.execute` 寻址·EntityCaseNamingStrategy camelCase 列）+ 7 实体零装饰器 defineEntity；**验收达成**：`pnpm run test:auth-consistency`（env-gated·专用 `vitest.consistency.config.ts`）authFlow in-repo 8/8 + evidence 真行×3 → 9/9 EXIT=0（scratch 库 `mikro_ba_consistency` 毕即 DROP）·默认 `ci` 基线 358 不动·`pnpm run ci` 全链 PASSED；`supportsDates:false` 为 raw 形态对切片 0 pinpoint③「置真」的取反（em.execute 回 timestamptz 为字符串）。**未接入 `scripts/ci.ts` 硬门禁链**（触清单 3·待人签核后另接）·未动生产装配（仍 Drizzle）·切片 2/3/4 未开工 |
| V5 | **已出 B 案待审**（global-runtime-node-pnpm v0.1·人裁"运行时修宪·未勾 ORM" 2026-10-15·候选稿零代码·待审计门） |
