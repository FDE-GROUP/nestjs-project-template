# 常量契约分治落点判据（成文化，零代码）

> 适用范围: `全局`（改 `docs/specs/architecture` 宪法·高危 #5）| 性质: 成文化既有现状 · 候选稿
> 关联: `module-es-outbox-transactional`（事件名/注册表双向锁机制已落地）· `global-readiness-error-pagination`（ERROR_CODES 码表已落地）· `module-es-first-real-consumer`（触发勘察：治理档实现中常量消费面被逐一定位，暴露「是否该建集中常量枢纽」之问）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**问题**：仓内 `as const` 常量七处、契约字典两张、注册表一个，分布虽已成形但**判据未成文**——每逢新常量（如本周期 `SUBSCRIPTION_STATUS.SUSPENDED`）落点靠临场推理，且「是否应剥离集中管理」反复被问。

**勘察实据（2026-10-17）**：现状即正确答案的雏形——
- **跨上下文契约已集中**：`DOMAIN_EVENTS`（`shared-kernel/domain/domain-event-names.ts`·注释明文「新增事件名一律先加这里」·字面量全仓单点）、`ERROR_CODES`（`shared-kernel/errors/error-codes.ts`）、`EVENT_TYPE_REGISTRY`（app 侧重建机制表·与 DOMAIN_EVENTS 双向锁死于测试）。
- **上下文自有枚举已内聚**：`TENANT_STATUS`/`USER_STATUS` 居 `tenancy/lifecycle/`、`SUBSCRIPTION_STATUS`+PLANS 居 `tenancy/quota/tenant-plans.ts`。
- **被 import ≠ 契约**：治理 handler 引 `TENANT_STATUS` 合法——该枚举出现在 `TenantStatusTransitionedEvent.payload` 上，本就是生产方事件契约的组成部分。
- **非契约杂项**：`tenant-status.service.ts` 的 `{ kind:'ok' } as const` 为结果对象字面量、`user.read-model.ts` 常量为读侧内部形——皆实现细节，不具契约资格。

**目标**：把「该不该集中」的判据固化为宪法一段（architecture 中英双份·「上下文间通信」节后），消灭重复讨论；**纯文档零代码零迁移**。

**非目标**：不新建 `constants/` 枢纽或包（勘察结论：会造横切 God 模块，与垂直切片宪法冲突·变更半径全局化）；不搬任何既有文件；不触 shared-kernel 代码。

## 2. 方案（拟写入宪法的条文·全文）

> ### 常量契约归属
>
> 常量的落点由**资格**决定，不由「复用次数」决定。判据三条：
>
> 1. **契约资格**：凡跨上下文通信、进程边界（HTTP 响应/事件信封）、持久化流（outbox/relay）所读的常量，必须居契约字典层——事件名进 `DOMAIN_EVENTS`、业务错误码进 `ERROR_CODES`，字面量全仓单点，且各以其机制（重建注册表/码表响应测）**双向锁死**防旁逸。新增此类常量一律先加字典。
> 2. **上下文自有枚举**：领域状态机枚举（`TENANT_STATUS`、`SUBSCRIPTION_STATUS`、PLANS 等）留驻其**属主上下文**目录；若该枚举是事件 payload 的一部分，则与事件类同栖于 core 侧生产上下文目录（消费方 import 的是契约本身，合法）。禁止为「集中」把它们抽入任何全局枢纽。
> 3. **非常量契约不入册**：结果对象字面量、读模型内部形等实现细节的 `as const`，不因被复用而升格为契约，不集中、不上迁。
>
> 推论：**不设全局 `constants/` 枢纽**（任何上下文演进都需改枢纽 = 横切 God 模块·违反垂直切片）；防散落靠机制（字典单点 + 锁测 + relay 拒收未知类型）而非目录集中。

### 2.1 落点

- `docs/specs/architecture-zh.md`：「上下文间通信」与「技术栈」之间新增上节（标题「常量契约归属」）。
- `docs/specs/architecture.md`：对应位（Cross-Context Communication 之后）补英文同义段。

## 3. 影响面与风险

- 高危 **#5**（改 `docs/specs` 宪法）——本 plan 即签核载体；条文是对既成事实的追认，**零代码改动**，不与任何现行实现冲突（勘察四条实据即合规证明）。
- 双份文档同步风险：中英两段一次提交内完成，防漂移。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计·照案签**（2026-10-17 AskUserQuestion：宪法条文照案签（高危 #5 随签）+ 验收口径「交付即结项」（纯追认性文档无行为风险））
- 未决项：无
- 审计人 / 日期：人（FDE·AskUserQuestion）· 2026-10-17

## 5. 完成判据（可核验 + 穷尽）

- [x] 宪法条文落 `architecture-zh.md`（「常量契约归属」）+ `architecture.md`（「Constant Contract Placement」）双位，语义一致·位均在跨上下文通信节与技术栈节之间
- [x] README 索引行翻「已验收·结项」（审计门同时裁「交付即结项」）
- [x] `pnpm run ci:quick` 绿（纯文档零代码）；精确提交推送

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 「常量契约是否应剥离集中管理」之问 + 治理档实现勘察 | 首版：现状实据（已两层分治）+ 宪法条文全文（判据三则+不设枢纽推论）+ 纯文档 scope |
| 2026-10-17 | 0.2.0 | 审计门照案签（高危#5 随签）+ 裁「交付即结项」 | 条文写入 architecture 中英双份；DoD 全勾；README 翻结项 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.2.0 变更，以当前正文内容为准。
