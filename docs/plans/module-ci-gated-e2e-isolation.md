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
- 【对账实据 2026-10-17·guard 片实跑自捕 ×2】① `scripts/ci-fullstack.ts` 清单存在**登记漂移**：tenant-hard-delete/seat-quota-member 早先随 `9eec820` 域归位重构迁居 modules/ 下后清单未同步→ vitest 对不存在路径**静默不跑**（长期仅 6/8 文件在链·无告警）；workspace-owner-rbac 为 owner-column 片漏登——均已按清单自身规则补齐（8→9）并全链恢复绿。② 并跑集变化后 outbox 败相从 ×2（`expected false to be true`/`expected 3 to be 1`）漂为 ×1 且形变（`expected 5 to be 4`）——坐实其断言的**非确定性本质**，与 B1 档（全局观测改 scoped）论据同构；另：静默漏跑对 vitest 是默认行为，隔离策略修订时需一并考虑「清单与实存文件恒等校验」（防再漂移）。

## 2. 裁定议题（归人·本 plan 不自裁）

**议题：隔离策略采哪档？**

| 选项 | 机制 | 成本/风险 |
|------|------|-----------|
| **B1 观测行Scoped 化（呈审推荐档·首选）** | 只改 gated e2e **测试文件自身**：outbox-relay 两败例断言从「全局计数/末位 id」改为「自有 fixture 行（唯一 aggregateId/eventId 标记）的状态迁移」——接受表内存在他人行且被 relay 捞走为正常并发语义；他方文件若有同类全局观测一并 scoped 化 | 不动门禁与编排，纯测试层；改后并发仍并行（零时长成本）；残余风险：relay「捞出≥1」类全局下界断言弱化为存在性断言（观测力度下降需如实登记） |
| **B2 event 触集串行** | vitest 分组/`fileParallelism` 调档把触 event 表文件排他串行（其余保持并行） | **触 `vitest.config.ts`/`scripts/ci*.ts` 门禁面（高危#6）**；时长增加（该组转串行）；分组名单是新的维护债（新文件触 event 表须记得入组——漏入即复发） |
| **B3 每文件独立库** | gated 组每文件建专属 schema/database（同容器 `createdb`），迁移链重放或模板库克隆 | 隔离最彻底但改动最大：ci:db 编排、连接串注入、迁移重放时长 ×N——重档，除非 B1/B2 实证不足不建议 |

**推荐判由**：B1 把「被测行为（全局 relay）与观测口径（全局断言）」解耦——竞态源于观测口径而非产品缺陷，scoped 断言后并发即安全；若实跑证明 B1 覆盖不了（如某断言天然必须全局语义），升级 B2 时再单独呈签门禁面。

**裁定结论（人 2026-10-17 令「同意」）**：采 **B1**。实施中勘察把互污机理定位得比呈审时更准——**竞态主体不是观测口径而是活跃竞争者**：`OutboxRelay` 为 app 启动 provider，outbox 模式下 `onApplicationBootstrap` 每 pollMs(50) 起全局轮询循环（[outbox-relay.ts](../../apps/api/src/database/outbox-relay.ts) L52-63）——五个 boot AppModule 的 gated 文件各在**自己进程**里跑一个全局捞行的 relay，与 outbox 测试的自属行真并发抢投递（tenant-status-link 早有进程内同类竞态「pollMs 拨大」绕法先例，跨进程面无防护）。故 B1 落地双管：① 五 boot 文件 `overrideProvider(OutboxRelay)` 以无操作替身节掉后台循环（零启动窗口·纯测试文件层·不触门禁/编排/生产码）；② outbox 文件两处全局观测（`published.length`）scoped 化到自有 aggregateId/eventId（旁观者行注入免疫）。**升级出口未启用**：全程未触 B2/B3 门禁面。（实施三轮迭代把终态精化为「双 relay 文件文件级串行锁」——机制演进与自捕详见 §6 v0.3.0，均在本片「仅改测试文件」授权域内。）

## 3. 影响面与风险

- **高危触达**：B2/B3 直接触门禁面（AGENTS §2 高危#6）；**B1 仅触 gated e2e 测试文件**，但仍属「测试隔离策略修订」的裁点——整片按高危呈审，审计放行前零实施。
- 既有在账断言：`global-ci-fullstack-pg` v0.2.2 行为事实登记，本片结项后补兑现指针。
- 非目标：outbox relay 生产语义改动（全局捞行是设计行为）、DB-free 门禁（L1）任何变更。

## 4. 取证计划（若放行实施）

以决定性复现集（三既有文件并跑 ×2 败）作红→绿铁证：实施前复现失败基线 → 按裁定档改造 → `pnpm run ci:db` 全链 ≥2 次连跑绿（防偶发漏网）→ 末次全量 L1 净。

## 5. 完成判据（可核验 + 穷尽）

- [x] 议题获人裁定（档名 + 是否授权升级 B2/B3 的出口条件）——2026-10-17 人令「同意」裁 **B1**；升级出口（B1 不足再呈签 B2）保留未启用
- [x] （仅当放行）决定性复现集红→绿 + `ci:db` 连跑 ×2 全绿 + L1 基线只增不减——实测链：改造前败相基线在案（×2/×1 漂变）→ 实施中三轮实跑逐步暴露残余竞态（i1 自捕断言 bug / j1 status-link 窃取 / k1 锁粒度互吞）→ 终态 `ci:db` **连续两次 EXIT=0（史上首次）**·gated 9 文件 31/31 + BA 一致性 9/9 + L1 523/31 只增不减
- [x] global-ci-fullstack-pg v0.2.2 行补对账指针 + README 翻账（2026-10-17 落）
- [x] 人类验收后结项——2026-10-17 人令「同意」作验收放行（同风先例）；「清单与实存恒等校验」缓账按高危归人纪律另立呈审片 [module-ci-gated-list-identity-check](./module-ci-gated-list-identity-check.md)（待审计·零实施）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | owner-column 片 §6 v0.3.0③ / ci-fullstack v0.2.2 缓账立片呈审（人令「你裁定，继续推进」→ 执行方**只起草不裁**：门禁面属高危#6，审计不放行） | 首版：事实链（全局 relay × 并行共享库竞态·决定性复现已在案）+ 议题 B1（scoped 断言推荐）/B2（串行）/B3（分库）+ 取证计划（红→绿复现集） |
| 2026-10-17 | 0.1.1 | guard 片实跑自捕两新事实入 §1（只补事实面·不改待裁性质） | ① ci-fullstack 清单登记漂移（2 stale 路径静默漏跑 + owner 漏登）已按清单规则机械补齐 8→9；② outbox 败相并跑集依赖漂变（×2→×1 且形变）坐实全局观测非确定性，B1 论据增补；新增「清单与实存恒等校验」需求入 B 面考量 |
| 2026-10-17 | 0.2.0 | **人裁 B1**（「同意」·审计放行·B2/B3 未授权）。§2 落裁定结论：互污机理精化——竞态主体是五 boot 进程各自的 app 启动后台 relay 轮询循环（outbox-relay.ts L52-63 实证），非仅观测口径；落地双管＝五文件 overrideProvider 节循环 + outbox 全局观测 scoped（§2 授权域内·纯测试文件层）。 |
| 2026-10-17 | 0.3.0 | **B1 落地三轮实跑迭代**（细节全在此·正文不动）：① 五 boot 文件 overrideProvider 节后台 relay 循环 + outbox 观测 scoped——实施中自捕新错：首版 scoped 断言用静态 `some()` 误判 case2 合法投递历史残留为违规（追加数组须用计数不变形），修正入 §5；② j1 跑暴露 tenant-status-link 手动 drain tickOnce 为最后竞态主体（B1 表格「观测 scoped 后并发即安全」之假设有误——**窃取权竞态非观测问题**）；③ 首版逐轮围锁的 k1 跑又暴露锁内互吞（持锁方捞走对侧未派发行→对侧消费者永不收敛）→ 终态=**双文件 beforeAll→afterAll 文件级串行锁**（O_EXCL 锁文件 + PID stale 接管·内联复制免新文件触构建面·纯测试层未触任何门禁配置）；l1/l2 连跑 EXIT=0 全链史上首次双绿。 |
| 2026-10-17 | 0.3.1 | 人类验收结项（令「同意」） | §5 验收框勾齐：B1 终态（文件级串行锁）与 ci:db ×2 双绿、L1 523/31 取证呈验放行；缓账「清单恒等校验」另立 module-ci-gated-list-identity-check 呈审片（待审计）；本片全结。【对账指针 2026-10-17】该呈审片已人令「你定」裁 C1 并落地（三向恒等校验·plan v0.3.0）。 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.1 结项（**已人类验收·全结**——B1 人裁与验收「同意」均在案）；发现登 §6 不入正文。
