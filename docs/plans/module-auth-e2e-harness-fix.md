# gated e2e 装配 harness 缺陷结清（tenant-hard-delete.e2e · AuthBootstrapService 需 Fastify 实例）

> 适用范围: `模块(test harness)`（`apps/api/src/tenancy/*.e2e` 装配面 · **零生产代码 / 零 schema / 零依赖 / 零门禁**）
> 关联: [global-orm-mikro-constitution-amendment](./global-orm-mikro-constitution-amendment.md) §5.8/§5.23 登记的「独立另案」· [module-auth-http-surface](./module-auth-http-surface.md)（`eb2bbbf` 引入 `AuthBootstrapService`·缺陷埋点）· [module-tenancy-hard-delete](./module-tenancy-hard-delete.md) §4-3（该 e2e 归属切片）· 修复落地 commit `7c4a34f`
> 性质: 结清型（缺陷已在 ORM contract 顺带修复·本案钉死根因 + 真库复验 + 正式销挂账·非新实现）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

- `tenant-hard-delete.e2e.test.ts` 是 `module-tenancy-hard-delete` §4-3 的唯一触真库证据（证 FK cascade / 事件补删 / user 幸存 / 幂等）。该 plan v0.4 结项时（`f56cae3`）记「gated e2e 真库 2/2」为真。
- 后续 `module-auth-http-surface` 片（`eb2bbbf`）引入 `AuthBootstrapService.onApplicationBootstrap`，在 **Fastify 实例级**挂 BA 原生路由。此后该 e2e 的 `beforeAll` **崩溃**（`httpAdapter.getInstance()` of undefined）——但因它是 **env-gated**（仅 `E2E_DATABASE_URL` 存在时运行·默认 CI 恒 skip），**从不进默认流水线**，缺陷长期潜伏未暴露。
- ORM 修宪案 contract 阶段真跑 gated e2e 全套时撞上此崩，§5.8/§5.23 三重复取证明：**与 ORM / 适配器无关**（mikro 轨与缺省 drizzle 轨逐字同失败·`git stash` 回退本片改动仍同失败·根因纯在 e2e 装配面），遂登记为「**独立另案·非 ORM 修宪范围**」。
- **目标**：钉死根因、确认修复已在 `7c4a34f` 落地、本轮以真库复验坐实、正式销账该「另案」挂账。
- **非目标**：❌ 不改任何生产代码 / schema / 依赖；❌ 不弱化断言换取通过（修复只补装配·行为面逐字不变）；❌ 不扩到其它 e2e 面（`auth-http-surface.e2e` 本就用同款先例·无此缺陷）。

## 2. 根因（已钉死）

- 该 e2e 早期用裸 `Test.createTestingModule({imports:[AppModule]}).compile()` + `ref.init()`（hard-delete plan v0.3 当时记「CommandBus 驱动需 `init()`·否则 @CommandHandler 未注册」——此点对，但不充分）。
- `ref.init()` **不实例化 HTTP 适配器**（无 `createNestApplication`）；而 `AuthBootstrapService.onApplicationBootstrap`（`eb2bbbf` 起）需要 Fastify 实例才能挂 BA 路由 → `beforeAll` 抛 `httpAdapter.getInstance()` undefined。
- 本质是**跨切片的测试装配不兼容**（auth-http-surface 片改了 boot 生命周期契约·未回扫既有 env-gated e2e），非 ORM 迁移引入。

## 3. 修复（已在 `7c4a34f` 落地·非弱化）

- `beforeAll` 改为真实建 Fastify 应用（对齐 `auth-http-surface.e2e` 先例）：
  `app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter()); await app.init();`
  → 实例化 Fastify httpAdapter 供 `AuthBootstrapService` 挂载 + `CqrsModule` 生命周期把 @CommandHandler 注册进 CommandBus（经 bus 驱动的本测必需 init）·无需 `listen()`。
- 断言面**逐字保留**：仍证六表 FK cascade 灭、tenant 事件补删至 0、user 行幸存、重复硬删幂等 null（controller 404）、active 硬删 409 前置闸——修复只补装配，不改行为契约。
- 夹具播种 / 级联读回 / afterAll 清净同片换轨 MikroORM（`em.insert` / `em.count` / `em.nativeDelete`·只换通道不改语义·属 ORM contract 的组成部分）。

## 4. 影响面与风险

- **blast radius**：仅测试文件 `apps/api/src/tenancy/tenant-hard-delete.e2e.test.ts` 的 `beforeAll` 装配段（+ MikroORM 通道换轨）。零生产码 / 零 schema / 零依赖 / 零门禁脚本 / 零 `docs/specs`。
- **可逆性**：完全可逆·revert 即净退。
- **高危清单**：不命中 `workflow.md` §3 任何一项。

## 5. 完成判据（可核验 + 穷尽）

- [x] 根因钉死为跨片测试装配不兼容·与 ORM 正交（修宪案 §5.8/§5.23 三重复取证存照：mikro 轨＝drizzle 轨同失败·stash 回退同失败）。
- [x] 修复已在 contract commit `7c4a34f` 落地（`createNestApplication(FastifyAdapter)` + `init()`·断言未弱化）。
- [x] **本轮真库复验（2026-10-16）**：专用 scratch 库 `nestjs_e2e_hd` → 基线迁移 `Migration20261016055354` 重放 13 表 → `E2E_DATABASE_URL`/`DATABASE_URL` 双指 scratch → `vitest run tenant-hard-delete.e2e.test.ts` **2/2 全绿**（含 Better Auth `baseURL` 未设 WARN·系 e2e 不涉回调的无害噪声）→ `DROP DATABASE nestjs_e2e_hd` 零足迹（不触 dev `nestjs_practice`）。
- [x] 默认 CI 不受影响：该测 env-gated·无 `E2E_DATABASE_URL` 时 `describe.skip`（pre-push `ci` 显示本文件 2 skipped·总 348 passed 不变）。
- [x] 挂账销账：修宪案「独立另案」标注结清·hard-delete plan 与其 README 索引行交叉引用本案。

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-16 | 0.1.0 | 人择「另立独立 plan 正式结清」（ORM 迁移主线收尾候选 2）| 首版结清案：钉死根因（`eb2bbbf` 装配契约变更未回扫 env-gated e2e·与 ORM 正交）·确认修复已落 `7c4a34f`·本轮 scratch 真库复验 2/2 + 零足迹·登记销账 |

---

<!-- 变更戳 -->
正文已于 2026-10-16 / v0.1.0 变更，以当前正文内容为准。修复代码不属本案（已在 `7c4a34f`）；本案为缺陷根因 + 复验 + 销账的结清留痕。
