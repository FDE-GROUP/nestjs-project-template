# 技术方案 · 业务面列表端点补分页（Page<T> 契约兑现）

> 状态: **已实现·待验收**（人批准 2026-10-14·甲乙丙丁戊照建议·CI **337/13** 新基线）| 读者: **Agent**（开发依据）
> 修订: v0.3 实现登记——DoD⑤ 实机面降级：/workspaces・/posts・/users 均有 session/租户墙前置（guard 先于 pipe），未鉴权 curl 无法触达 DTO/信封面；改由元数据测（@Query ListPageDto paramtypes 锁 ×3）+ adapter/handler 测（信封+两发+参数下传）等价覆盖，真会话面留 gated tenant-isolation e2e（其 substring 断言对 Page 形天然兼容·零改）。既有测试刷新 4 处调用点（两 adapter list() 加参 + users.controller findAll + mock 形状），逐处披露于 diff。
> blast radius: **跨模块小中片**（3 个业务列表端点 `T[]` → `Page<T>` **响应形状破坏性变更**·port 签名 ×2·query 载体 ×3·零 schema）
> 缘起: 分页契约片（结项 `8d85e5b`）甲项遗留——`Page<T>`/`createPage`/`ListPageDto` 契约已就位，但业务面三个裸数组端点未接入，契约只有平台治理面在用。人裁立项（选项 3）。

## 1. 背景与既有事实（勘察坐实）

三个业务列表端点现全为**无界裸数组**：

| 端点 | 链路 | 下钻形态 |
|---|---|---|
| `GET /workspaces` | controller(apps) → `ListWorkspacesQuery`+handler(**libs/core**) → `WorkspaceRepository.list()` port(core) → drizzle adapter(apps) | port `.list(): Promise<WorkspaceRecord[]>` |
| `GET /posts` | 全链 apps（参考模块·同构形状） | port `PostRepository.list()` 同款 |
| `GET /users` | controller → `GetUsersQuery`+handler → **无 port**，handler 直注 `DrizzleService` 全表 `findMany`（pragmatic CQRS） | 无界全表读·三者中载荷风险最高 |

- **port `list()` 消费方实锤**：每 port 仅其 query handler 一处调用（grep 全仓无其他消费方）→ 可**换签名**不留并存。
- **对齐模板已在仓**：平台治理面 `drizzle-tenant-governance.repository.ts` 的 `list(opts{limit,offset,…})` = 双 select（rows 然后 count）+ `createPage`；DTO 侧 `ListPageDto`（common/dto·limit 默认 20/offset 默认 0·已实跑验证校验链）业务面**直接复用、无需新 DTO**（业务面无 search 维度）。
- 治理面既有语义保持：租户 scoping 仍在仓储层唯一卡点（S2 纪律），handler/adapter 不点名 tenantId；分页改造不动这条线。

## 2. 变更设计

### 2.1 契约层（统一形状）
- **port 换签名**（×2：core `WorkspaceRepository`、apps `PostRepository`）：`list(request: PageRequest): Promise<Page<T>>`——`PageRequest`/`Page` 用 `@core/shared-kernel/domain/pagination` 既有类型（别名 `PlatformTenantPage` 那套不动）。
- **query 载体多态化**（×3）：`ListWorkspacesQuery`/`ListPostsQuery`/`GetUsersQuery` 构造函数收 `PageRequest`，handler 透传给 port/直查。Query 类各仅 1 处构造（controller），破坏面自洽。

### 2.2 执行层
- **adapter ×2**（workspaces/posts drizzle）：对齐治理面模板——rows select 加 `.limit(request.limit).offset(request.offset)`，count 用既有 drizzle 风格单独一发，`createPage(rows, total, request)` 收口。租户 scoping where 子句原样保留。
- **users handler（无 port）**：直查面同样两发（findMany 带 limit/offset + `count()`），`createPage` 收口；**不**为其新设 port（保持 pragmatic CQRS 现状·不为分页造层）。
- **controller ×3**：`@Query() dto: ListPageDto`（值导入·S9 铁律）→ 传入 query；返回类型 `Promise<Page<…ReadModel>>`。

### 2.3 明确不做
- sort/cursor 白名单维持分页片丁裁缓账（softkit 观察项已挂）；
- 不动 `TransformInterceptor` 成功包装逻辑（治理面 Page 走它已有实况，业务面对齐即可）；
- `GET /users` 的 PII/权限面**不在本片扩大范围**（其暴露面若需收紧属独立议题，可在验收汇报时另行提请）；
- 不改 `search` 等治理面专有维度。

## 3. 破坏性窗口声明（裁决点甲）

`T[]` → `Page<T>` 是**响应形状破坏性变更**（下游若已消费这三个端点会碎）。论据与错误契约片形态裁同款：**前端尚未入场 = 最后便宜改窗**；且改后业务面与治理面**五端点统一 `Page` 形状**，模板下游学到的是唯一分页形态（不分裂）。备选：保守只加 limit 不返 Page 信封（否决——契约片成果闲置，形状仍分裂）。

## 4. 测试设计（DoD）

1. **adapter 分页测 ×2**（workspaces/posts·对齐治理面既有测风格：rows/count 两发、limit/offset 下传、createPage 形状断言；mock-drizzle 零 DB）。
2. **users handler 分页测**（同款 mock 断言 limit/offset + count）。
3. **controller 元数据测刷新**（既有 `.controller.metadata.test.ts` 模式·`@Query ListPageDto` 进 design:paramtypes 值导入锁·若该三 controller 原无元数据测则新建最小一张）。
4. **query handler 透传测**（3 条·handler 把 request 原样交 port）。
5. 实机佐证：dev 服 `GET /api/v1/workspaces?limit=1&offset=0`（带会话或有旁路则证形状；不可达则退化为集成测证据并如实登记）。
6. CI 全绿（基线 **327/13** 只增不减）；既有零改断言端点若因形状变化必须改测，diff 逐处披露。

## 5. 演变记录

- v0.1（2026-10-14）：初稿待审计。裁决点：**甲·破坏性窗口**（三端点统一换 Page 形·或缩面保留裸数组白名单）；**乙·port 换签名不留并存 list()**（消费方实锤单一）；**丙·users 不新设 port 直查改造**；**丁·ListPageDto 直接复用不新建业务 DTO**；**戊·DoD 6 项照建议**。
- v0.2（2026-10-14）：人批准过门，甲乙丙丁戊照建议。
- v0.3（2026-10-14）：实现完成待验收——port×2 换签名・query×3 收 PageRequest・handler×3 透传・adapter×2+users 直查两发+createPage・controller×3 收 ListPageDto（值导入）；新建/增补测 10 张（含元数据锁×3·信封测×2·透传测×2·users 直查测×3）；既有 4 处调用点刷新；gated e2e 零改（substring 断言形状不敏感）；CI **337/13**（+10）。
