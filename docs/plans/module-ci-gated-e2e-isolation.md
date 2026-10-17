# ci:db env-gated e2e 组共享库并发互污：隔离策略修订呈审（高危#6 门禁面）

> 适用范围: `门禁(ci:db env-gated e2e 组的测试隔离策略)` ← = blast radius：**门禁/CI 面修订（AGENTS §2 高危#6）**+ gated e2e 夹具断言形状——须人签核，概括授权不适用本片
> 关联: [global-ci-fullstack-pg](./global-ci-fullstack-pg.md) §6 v0.2.2（发现登记源头）· [module-workspace-owner-column](./module-workspace-owner-column.md) §6 v0.3.0③（归因实跑出处）· `specs/tooling-standards.md` §4.10（实跑对拍纪律）
> 性质: 缓账呈审（归人裁点结构化·非执行文档）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与事实链（均已实跑取证·非推测）

`pnpm run ci:db` 的 env-gated e2e 组（`E2E_DATABASE_URL` 开启）共享同一 `nestjs_e2e` 库**并行**跑，其中触 `event` 表的文件互污：

- `apps/api/src/database/outbox-relay.e2e.test.ts` 稳定 2 败（`expected false to be true` / `expected 3 to be 1`）；
- 机制：relay `tickOnce()` 按「全表未派发行」工作（被测行为本身如此），并行文件向 `event` 表插行 → 本文件 relay 捞到**他人行**投递到**自己的总线**、或他方 `lastEventId`/计数观测被本文件插行漂移——竞态双向成立；
- 决定性归因（owner-column 片实跑）：**不带该片任何新文件**，仅并跑三既有触 event 表文件即复现 ×2 败；outbox-relay 单跑 5/5 绿 ⇒ 既有隔离策略缺陷，非迁移链问题、非任何单文件 bug；
- 触 event 表/gated 组现有 10 文件（`outbox-relay` / `event-store.mikro` / `tenant-status-subscription-link` / `tenant-hard-delete` / `seat-quota-member` / `tenant-isolation` / `auth-http-surface` / `posts-cursor-pagination` / `workspace-owner-rbac` 等），互污面以 event 触集为核心。

## 2. 裁定议题（归人·本 plan 不自裁）

**议题：隔离策略采哪档？**

| 选项 | 机制 | 成本/风险 |
|------|------|-----------|
| **B1 观测行Scoped 化（呈审推荐档·首选）** | 只改 gated e2e **测试文件自身**：outbox-relay 两败例断言从「全局计数/末位 id」改为「自有 fixture 行（唯一 aggregateId/eventId 标记）的状态迁移」——接受表内存在他人行且被 relay 捞走为正常并发语义；他方文件若有同类全局观测一并 scoped 化 | 不动门禁与编排，纯测试层；改后并发仍并行（零时长成本）；残余风险：relay「捞出≥1」类全局下界断言弱化为存在性断言（观测力度下降需如实登记） |
| **B2 event 触集串行** | vitest 分组/`fileParallelism` 调档把触 event 表文件排他串行（其余保持并行） | **触 `vitest.config.ts`/`scripts/ci*.ts` 门禁面（高危#6）**；时长增加（该组转串行）；分组名单是新的维护债（新文件触 event 表须记得入组——漏入即复发） |
| **B3 每文件独立库** | gated 组每文件建专属 schema/database（同容器 `createdb`），迁移链重放或模板库克隆 | 隔离最彻底但改动最大：ci:db 编排、连接串注入、迁移重放时长 ×N——重档，除非 B1/B2 实证不足不建议 |

**推荐判由**：B1 把「被测行为（全局 relay）与观测口径（全局断言）」解耦——竞态源于观测口径而非产品缺陷，scoped 断言后并发即安全；若实跑证明 B1 覆盖不了（如某断言天然必须全局语义），升级 B2 时再单独呈签门禁面。

## 3. 影响面与风险

- **高危触达**：B2/B3 直接触门禁面（AGENTS §2 高危#6）；**B1 仅触 gated e2e 测试文件**，但仍属「测试隔离策略修订」的裁点——整片按高危呈审，审计放行前零实施。
- 既有在账断言：`global-ci-fullstack-pg` v0.2.2 行为事实登记，本片结项后补兑现指针。
- 非目标：outbox relay 生产语义改动（全局捞行是设计行为）、DB-free 门禁（L1）任何变更。

## 4. 取证计划（若放行实施）

以决定性复现集（三既有文件并跑 ×2 败）作红→绿铁证：实施前复现失败基线 → 按裁定档改造 → `pnpm run ci:db` 全链 ≥2 次连跑绿（防偶发漏网）→ 末次全量 L1 净。

## 5. 完成判据（可核验 + 穷尽）

- [ ] 议题获人裁定（档名 + 是否授权升级 B2/B3 的出口条件）
- [ ] （仅当放行）决定性复现集红→绿 + `ci:db` 连跑 ×2 全绿 + L1 基线只增不减
- [ ] global-ci-fullstack-pg v0.2.2 行补对账指针 + README 翻账

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | owner-column 片 §6 v0.3.0③ / ci-fullstack v0.2.2 缓账立片呈审（人令「你裁定，继续推进」→ 执行方**只起草不裁**：门禁面属高危#6，审计不放行） | 首版：事实链（全局 relay × 并行共享库竞态·决定性复现已在案）+ 议题 B1（scoped 断言推荐）/B2（串行）/B3（分库）+ 取证计划（红→绿复现集） |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 起草（**待审计——高危#6 门禁面，须人单点签核，本 plan 不接受概括授权放行**）；以裁定后内容为准。
