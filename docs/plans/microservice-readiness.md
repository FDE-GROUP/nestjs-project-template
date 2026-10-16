# 微服务就绪度路线（Microservice Readiness）

> 适用范围: `全局` ← blast radius，审计深度=人签核（`workflow.md` §3/§5）
> 关联: [research/nestjs-fastify-nx-review.md](../research/nestjs-fastify-nx-review.md)（借鉴源·参考非依据） · [plans/event-sourcing-roadmap.md](./event-sourcing-roadmap.md) Phase B · [plans/global-tenancy.md](./global-tenancy.md) §9.5（S10 边界） · `specs/architecture.md`
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

S10 已交付「能拆」的编译期接缝（core 框架无关 + 端口倒置 + 事件通信），但**部署上仍是单体**，且微服务的真实约束在运行时与数据边界，不在包数量。本 plan 的目标：**把"何时拆、按什么顺序拆、拆前必须有什么"写成可审判据**，并把低成本高杠杆的就绪机制提前落进现有切片节奏。

**非目标（明确不做）**：
- ❌ 本阶段**不拆任何包 / 不新增 workspace / 不拆库 / 不引入消息中间件**（无触发器即不动）；
- ❌ 不追求微服务终态承诺——愿景（vision §7）仍是模块化单体的 SaaS 参考实现；
- ❌ 不借鉴调研对象的工具链（Prisma/pnpm/Nx/ESLint——铁律冲突，见 research §4）。

## 2. 方案

### 2.1 拆分触发器（不满足则一切照旧）

任一上下文满足 **≥1 条**才允许立项拆分该上下文：
1. 需要不同的扩缩容轴（I/O 密集 vs 写密集 vs CPU）；
2. ≥2 个团队在发布节奏上互相阻塞；
3. 需要独立 SLA / 独立发布周期；
4. 合规要求该上下文数据物理隔离（PIPL 场景下此条最可能先触发）。

### 2.2 三阶段迁移路线（触发后按序走，逐级不可跳）

- **Stage 1 · 拆运行时不拆数据**（可逆）：为触发上下文新增独立入口（composition root）与部署目标，复用 `packages/core` + 现有模块库；应用代码零改动。回滚 = 删部署目标。
- **Stage 2 · 边缘上下文拆数据**：仅对「**无入向外键**」的上下文（当前形态下：audit 类、storage 元数据类候选；**auth/session 路径上的任何件明确不拆**）迁独立 schema/库；`tenantId/userId` 降为引用值而非跨库 FK；入向依赖全部改走事件/显式 API。
- **Stage 3 · 拆 core（users/auth）**：最后。Better Auth 在请求管线外写库、会话为全站依赖，拆它须以 saga 补偿替代跨上下文事务——仅当触发器对 core 自身成立才考虑。

### 2.3 就绪机制（现在就位·与触发器无关的"便宜预备"）

按投入产出排序的候选切片（**每片须独立过审计门，本 plan 只立项排序**）：

1. **表所有权纪律成文**（低成本·纯文档+守卫）：把「每上下文仓储只碰自己的表；跨上下文外键只允许指向 auth core；feature↔feature 禁止」写入 `specs/architecture.md` 附录，并以 grep/矩阵测试锁死（对齐 S2 仓储唯一卡点惯例）。
2. **ES Phase B outbox 设计补强**（回灌 `event-sourcing-roadmap`）：采纳四件套——同事务原子写（域行与事件行共存亡）/ 事件名集中常量 + 契约测试双向锁定 / envelope 版本化且 relay **拒收**新版本 / 消费者幂等为硬要求。发布通道做成**双模开关**（进程内默认 / outbox 耐久），对齐我方「事件发而不存 → append-only」的既有分阶段。
3. **错误契约增量扩展**：`ErrorResponse` 保形加 `code`（稳定业务错误码）+ 校验/业务失败共用扁平 `errors[]`（RFC 9457 思想，不换响应壳）——补 repowiki 已记录的「无错误码」短板。
4. **Codegen-only 导出模块**：HTTP-only AppModule 变体直接 boot 出 OpenAPI spec，去掉「先起 7009」依赖（我方 DB-free compile 整树已验证可行，阻力最小）。
5. **分页规范**：列表端点统一 Stripe 风格游标（`has_more` + 编码 cursor），offset 为例外——立为 tooling/architecture 标准后再逐端点迁移（expand–contract）。
6. **（挂专项）全栈 CI 拼 PG**：以 Testcontainers 自动拉起真库跑 env-gated e2e，替代手工 `nestjs_e2e` 库——归既有「全栈 CI」专项，不另立项。

## 3. 影响面与风险

- **blast radius**：§2.3 各项均为局部可逆增量（文档/守卫/响应字段加法/构建脚本），**不触 schema、不触部署形态**；Stage 1–3 本身在本 plan 内**不执行**，仅备判据。
- **高危清单命中预判**：#2 触 schema（events/outbox 表·高危#1 逐次人审）；#3 触公共契约（响应字段·高危#4 口径需人签核）；其余不命中。
- **主要风险**：过早机制化（为不存在的拆分付纪律成本）——以「触发器不满足时 §2.3 仅按 1/4 两项最便宜项执行」缓解；outbox 引入运维面（relay/重试/DLQ）——绑定 Phase B 真实需求，不提前。
- **回滚策略**：§2.3 各项独立可回滚（文档撤销 / 开关回默认 / 字段移除即 expand 逆操作）。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计**（盘点阶段交付物·人签核 2026-10-14；本 plan 仍不预授权任何实现，各切片另过各自审计门）
- 未决项逐裁：① 首切片范围=**全取 #1+#4**（#2 outbox 随 Phase B 后半缓、#3 错误契约缓·命名规范已锁、#5 分页缓、#6 归全栈 CI 专项）；② 错误码命名空间=**冒号分隔**（如 `TENANCY:SEAT_LIMIT_EXCEEDED`；点分与事件名相撞且撞 nestjs-i18n 键语法，code 为机器标识与翻译键解耦）——随 #3 实施时生效；③ outbox 表归属：**缓裁**（随 #2 触发时定）；④ 游标分页本期性：**否**（立标准后另裁）。
- 审计人 / 日期：人（用户「同意」）/ 2026-10-14
- 执行入口：首切片 [global-readiness-initial-slice](./global-readiness-initial-slice.md)（**已验收·结项** 2026-10-14·commit `0e0ad02`·CI 276/10）；后续切片（#2 outbox/#3 错误契约/#5 分页）按 §4-① 裁法各自触发时另立 plan。**〔2026-10-17 更新〕#3 错误契约 + #5 分页已立案**：[global-readiness-error-pagination](./global-readiness-error-pagination.md)（**待审计·未开工**·两片 expand 设计 + 甲–戊 归人裁点）；#2 outbox 仍随 Phase B 后半缓。

## 5. 完成判据（本 plan 的「盘点阶段」交付）

- [x] 触发器 / 三阶段 / 就绪机制成文并可审（本文档）
- [x] 审计门：人签核 §2.3 执行范围，未决 ①–④ 逐项裁决（2026-10-14·见 §4）
- [ ] 过审后各切片按各自 plan/本片留痕执行（本 plan 不预授权任何实现）——首切片见 [global-readiness-initial-slice](./global-readiness-initial-slice.md)

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-14 | 0.1.0 | 由「是否进一步拆包」讨论引出；借鉴评估落 research，判据与路线升格为 plan 草案（待审计） | 首版：触发器判据 / 三阶段路线 / 就绪机制 6 项排序 / 风险与未决 |
| 2026-10-14 | 0.2.0 | 人签核过审计门 | §4 逐裁 ①–④（首切片=#1+#4·错误码冒号分隔锁死·③④缓裁）；§5 审计项勾选；指向首切片子 plan |

---

<!-- 变更戳 -->
正文已于 2026-10-14 / v0.1.0 变更，以当前正文内容为准。
