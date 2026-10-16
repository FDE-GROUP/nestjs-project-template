# ES Phase B 后半：outbox 同事务化 + relay 耐久投递

> 适用范围: `全局`（触 core 公共契约 · schema 迁移 · env 面）| 性质: 初稿 · 候选稿
> 关联: `event-sourcing-roadmap.md` Phase B「后半待专项」· `microservice-readiness.md` §2.3-#2（触发即本片）· `global-orm-mikro-constitution-amendment.md`（表元数据 SSOT `EVENT_META`）· `global-ci-fullstack-pg`（真库验证底座）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**再裁决在案**：既有裁决「shadow append 即终态·后半待真实业务上下文」（2026-10 早前）已由人于 2026-10-17 明示推翻——择「甲·现在就建 outbox」，接住 relay 运维成本，为支付/订单上下文与未来拆服务预制耐久事件通道（高危 #1 随裁签核）。

**痛点（dual-write 实据）**：现行 `DefaultDomainEventPublisher.publishAll` = 业务行经 store `fork()` 独立提交后，事件再经**另一 fork** append、随即进程内 `publishAll`。两处写跨事务非原子：save 提交后 append 前进程崩溃 → 业务态生效而审计事件**永久缺失**；且 publishAll 早于外层任何提交语义。治理面三处活站点同病：`TenantStatusService.transition`、`UserStatusService.transition`（libs/core）、`RejectTenantCommandHandler`（apps/api）。

**勘察纠错（登记）**：前轮收尾小结称「event 表 relay 骨架列已备、或零新迁移」——**不实**。`EVENT_META` 现列仅信封 10 列（id/eventId/aggregateId/aggregateType/version/eventType/eventVersion/payload/metadata/occurredAt/createdAt），无任何投递状态列。故本片**必含迁移**（高危 #1 非虚设）。

**目标**（roadmap §写路径切换「设计参考」五点逐一对位）：① 域行与事件行**同事务原子写**；② 事件名集中常量 + 契约测试双向锁（补全 `eventType→类` 注册表单源）；③ envelope 携 `eventVersion`，relay **拒收**比自己新的信封；④ 消费者幂等（relay 端 at-least-once 去重窗 + 消费方幂等声明）；⑤ 发布通道**三模开关**（inproc 默认 / shadow 现状 / outbox 耐久），与 Phase A 平滑共存。

**非目标**：rehydrate 投影 / 快照 / 读侧切换（CRUD 仍唯一真相源）；跨进程 MQ（单体形态，relay 只做进程内投递，但投递状态耐久在表、多实例安全）；`user.registered` 无活发布点的遗留 seam 不新接通（BA 注册路径现状不动，另行挂账）。

## 2. 方案

### 2.1 机制

- **同事务（ambient UoW）**：core 声明 `UNIT_OF_WORK` 纯端口（`run<T>(fn)`），apps/api 以 AsyncLocalStorage 实现——活跃事务内 `MikroOrmService.fork()` 返回事务 em（沿 S10 端口倒置先例，端口签名零破坏）。三个发布点把**关键段**（状态写 + `publishAll`）包入 `uow.run`：outbox 模式下 publisher 在事务 em 上 INSERT 事件行（`dispatchedAt=null`）即原子；**任何模式**下包装都成立——shadow 模式顺带获得「append 失败 → 业务写一并回滚」的更强「宁缺勿错」语义（现状 save 已提交、append 失败仅 500，登记为语义收紧）。inproc 模式无库写，UoW 空转等价。
- **三模开关**：`EVENT_PUBLISH_MODE: 'inproc'|'shadow'|'outbox'`（缺省 `inproc`，与今 `EVENT_STORE_ENABLED` 未置 true 逐字节等价；`shadow`=今 `true` 语义保形）。`EVENT_STORE_ENABLED` 退场由 乙 裁。
- **relay**：app 内 poller（`setInterval` + `OnModuleDestroy` 摘停，不引 `@nestjs/schedule`），仅 `outbox` 模式启动（DB-free 不变量：缺省不触库·懒建连接不劫持装配冒烟）。每拍 `FOR UPDATE SKIP LOCKED` 取 ≤50 条 `dispatchedAt IS NULL` 按 id 升序（流内保序）；`eventVersion > 本 relay 支持上限(=1)` → 置 `lastError` 拒投递（丙/丁 裁处置）；反序列化为 `DomainEvent` 类实例经 `EVENT_TYPE_REGISTRY`（`eventType→类` 单源，契约测试与 `DOMAIN_EVENTS` 常量双向锁定）投进程内 `EventBus`；成功置 `dispatchedAt`，失败 `attemptCount++`＋`lastError`，超上限（默认 5）停止重试留痕告警（DLQ 以表内状态查询表达，不建独立死信表）。
- **幂等**：投递语义 at-least-once（置位后再崩溃 → 重投），relay 端维护 processed-eventId 有界 LRU（1e4）去重窗；消费者现仅 `UserRegisteredEventHandler`（log no-op·天然幂等），幂等列为对后续消费者的**硬要求声明**（写入 roadmap）。
- **PIPL**：`deleteByAggregate` 既有面天然覆盖 outbox 行（同表），级联语义零新代码。

### 2.2 垂直切片（每片可独立验证·默认态行为不变）

1. **切片 A——schema**：`EVENT_META` 加 `dispatchedAt`(nullable timestamptz)/`attemptCount`(int default 0)/`lastError`(nullable text) + 部分索引 `event_undispatched_idx`；按真相源流程生成迁移（链号续基线）、DDL 恒等闸绿。判据：迁移应用 + `ci-fullstack` 基线重放绿 + 恒等闸测绿。
2. **切片 B——同事务机制**：`UNIT_OF_WORK` 端口 + ALS 实现 + `fork()` 事务参与 + 三发布点关键段包装 + publisher 的 `outbox` 分支（事务内插未投递行·**不**立即 publish；事务外调用 fail-loud）。判据：单测锁「append 抛错 → 业务写回滚」与「缺省模式逐字节等价」（既有 `domain-event-publisher.test` 保形）。
3. **切片 C——relay + 注册表**：poller / `SKIP LOCKED` 批量 / 版本拒收 / 重试上限 / LRU 去重 / `EVENT_TYPE_REGISTRY` 与契约测试双向锁。判据：单测（mock em）+ 真库往返 gated e2e（业务动作 → 同事务行可见未投递 → relay 投递 → `dispatchedAt` 置位 → 重复投递被去重）。
4. **切片 D——开关成契约 + 文档对账**：`EVENT_PUBLISH_MODE` 入 envs 三层 + Joi + `.env.example`（高危 #6 随签）；`GATED_E2E_FILES` 登记新 e2e；roadmap Phase B 后半留痕、README 架构范式行（shadow append 后补 outbox 就绪）、`ci:db` 复跑。判据：文档三面 + `test:fullstack` 全绿。

### 2.3 裁点（审计门须逐条落判）

- **甲**（已裁）：现在就建 outbox、高危 #1 签核——2026-10-17 AskUserQuestion 择甲。
- **乙**：开关形态——**已裁：三态取代布尔**（`EVENT_PUBLISH_MODE: inproc|shadow|outbox` 单旋钮·缺省 inproc 逐字节等价·旧 `EVENT_STORE_ENABLED` 退场·高危#6 随签）。
- **丙**：投递语义——**已裁：at-least-once**（后置标记·崩溃重投必然·配 relay 端 eventId 去重窗 + 消费者幂等硬要求写入 roadmap）。
- **丁**：版本拒收处置——**已裁：行级标记跳过**（置 `lastError='unsupported version'` 停止重试留表可查·relay 整体不停摆）。
- **戊**：迁移执行面——**已裁：Agent 执行 dev 库**（沿 ORM 切片先例：生成迁移 + 本地 dev 库 migrate + ci-fullstack 一次性库重放验证；生产/真实库永不自行动手）。

## 3. 影响面与风险

- **高危命中**：#1 schema 迁移（甲已随签·执行细节=戊）；#4 core 公共契约（新端口 + registry）；#6 env 面（.env.example 改动·随审计门签）。**不触** #3 门禁：默认 `ci`/`ci:quick`/pre-push 与 DB-free 不变量不动（380 passed | 20 skipped 只增不减基线）。
- **锁持有**：UoW 包装使治理关键段（2–4 个操作）共一事务，锁时增长——治理动作低频，可接受；HTTP 面语义（409/404 分支零库写）不变。
- **投递延迟**：`outbox` 模式进程内派发延迟 = 轮询间隔（默认 1s）；治理面消费者无实时依赖（no-op 证实）。
- **误开风险**：`outbox` 误开而 relay 未起（如单测环境）→ 事件积压不丢（表内耐久），fail-safe 方向正确；缺省 `inproc` 与今逐字节等价，回归由既有 publisher 单测 + 装配冒烟锁。
- **双写残留**：`user_status`/metadata 的 BA 侧联动（session 硬删等）在关键段之外，不并入本片事务边界（边界=三发布点关键段，防止范围蔓延）。

## 4. 审计记录

> 无已审方案不写码。局部可逆 → 轻量自审；全局 / 不可逆 → 人签核。

- 结论：**已审计·人签核开工**（2026-10-17 AskUserQuestion 乙–戊逐裁·全取推荐：乙=三态取代布尔·丙=at-least-once·丁=行级标记跳过·戊=Agent 执行 dev 库；甲=再裁决择甲已于立案前落判·高危 #1/#4/#6 随签）
- 未决项：无（乙–戊已全部落判）
- 审计人 / 日期：人（FDE·AskUserQuestion）· 2026-10-17

### 4.1 执行留痕（切片 A–D · 2026-10-17）

- **偏差登记（切片 A）**：① `dispatchedAt` 实落为 **`timestamp`（无 tz）**——与基线 `event` 表其余时间列同口径（`ColKind.datetime`），非 §2.2 字面的 timestamptz；② 索引实落为**普通索引 `event_dispatched_idx`**非部分索引——`TableMeta.indexes` 元数据面（`column-meta.ts` ColKind）不支持 partial `where`，不为此扩元数据面（机制修复不逐模块特判·防范围蔓延）；扫描浪费仅已派发行、当前量级可忽略；后续若需收窄另开元数据面专项。
- **切片 A**：`EVENT_META` 加 `dispatchedAt`/`attemptCount`/`lastError` + 索引；迁移 `Migration20261016181722_add_event_outbox_columns`（纯 additive·down 对偶可逆）经人签（戊）应用 dev 库·`\d` 核验列/索引在表；`ci-fullstack` fresh 库重放（2 迁移）绿——恒等由「generate 对 snapshot 差异干净 + 重放绿」坐实。
- **切片 B**：core 端口 `UNIT_OF_WORK`（`run<T>(fn)`）+ apps/api `TransactionScope`（纯 ALS holder·零应用依赖防循环导入）+ `MikroUnitOfWork`（重入复用外层事务）；`MikroOrmService.fork()` 事务内返事务 em + 新增 `newTransactionEm()`；publisher 三模分支（outbox 事务外 fail-loud）；三发布点（Tenant/UserStatusService.transition、RejectTenantCommandHandler）包 `uow.run`；envs 三层 + Joi + `.env.example` 换 `EVENT_PUBLISH_MODE`/`EVENT_OUTBOX_POLL_MS`（旧 `EVENT_STORE_ENABLED` 退场）；publisher 单测重写 6 例锁「缺省逐字节等价 + append 失败回滚语义」。
- **切片 C**：`EVENT_TYPE_REGISTRY`（4 类·契约测与 `DOMAIN_EVENTS` 双向锁）+ `OutboxRelay`（仅 outbox 启 timer·`SKIP LOCKED` 批量 50·id 升序·版本拒收/未知类型 park·MAX_ATTEMPTS=5 表内留痕·eventId LRU(1e4) 去重窗·防重入）；单测 11 例全绿。
- **切片 D**：`outbox-relay.e2e.test.ts`（5 例：同事务回滚反证/投递/去重重投/版本拒收/publisher 守卫）登记 `GATED_E2E_FILES`（6→7 文件）；`test:fullstack` EXIT=0 全绿零足迹；文档三面（roadmap 第五切片段+幂等硬要求+「不做」段校准·plans README 索引·本节留痕）。

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A：迁移链续进一号·恒等闸绿·`ci-fullstack` 基线重放绿
- [x] 切片 B：三发布点同事务；「append 失败 → 业务回滚」单测锁死；缺省模式行为逐字节等价（既有测保形）
- [x] 切片 C：relay 真库往返 gated e2e 绿（未投递→投递→标记→去重重投）；版本拒收 + 重试上限单测
- [x] 切片 D：envs/Joi/.env.example 三处一致；文档三面留痕；`GATED_E2E_FILES` 登记
- [x] `pnpm run ci` 全绿且基线 380 passed | 20 skipped 只增不减；`pnpm run ci:db` 全绿零足迹；Biome 净（实证 2026-10-17：L1 CI PASSED · **393 passed | 25 skipped**（+11 新单测·+5 新 gated e2e skip）；`test:fullstack` 7 文件真库全绿零足迹；Biome check 净）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人再裁决择甲（推翻「shadow 即终态」·高危#1 随签） | 首版：dual-write 实据 / relay 列缺失纠错 / 五点机制 / 四切片 / 乙–戊裁点 |
| 2026-10-17 | 0.1.1 | 审计门过人签核 | 乙–戊逐裁留痕（全取推荐：三态取代布尔·at-least-once·行级标记跳过·Agent 执行 dev 库）；README 索引翻「已审计·进行中」 |
| 2026-10-17 | 0.1.2 | 切片 A–D 实现完成 | §4.1 执行留痕（含部分索引→普通索引·timestamptz→timestamp 两偏差登记）；§5 前四勾；README 索引翻「已实现·待验收」；roadmap 第五切片段留痕 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.2 变更，以当前正文内容为准。
