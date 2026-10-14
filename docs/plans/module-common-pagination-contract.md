# 技术方案 · 分页契约泛化 `Page<T>`（softkit 借鉴正向项 #2）

> 状态: **已验收·结项**（人批准 2026-10-14·甲乙丙丁照建议·commit `8d85e5b`·CI **304/13** 新基线）| 读者: **Agent**（开发依据）
> blast radius: **跨面小片**（`packages/core` shared-kernel 加纯类型契约 + apps/api 两个 platform 侧 page 形状/两个 DTO 换源·**零行为变更零 schema**·不动任何响应 JSON 形状）
> 缘起: 评价 softkit-nestjs-boilerplate 借鉴清单 **#2**（nestjs-paginate 之"思路"——分页契约统一，借思路不借库）。

## 1. 背景与问题（勘察坐实）

- 本仓已有**两个同构分页面却各自重复定义**：`PlatformTenantPage{items,total,limit,offset}`（tenants domain）与 `PlatformUserPage`（同形·user domain）；`ListPlatformTenantsDto` 与 `ListPlatformUsersDto` 亦逐字段重复（limit 1-100 默认 20 / offset ≥0 默认 0 / search）。
- 业务面 list 全部零分页：posts `list()`、workspaces `list()`、subscriptions `history()` 返回全量数组——大租户下无上限（本片不处置，见 §2 非目标与 §6-甲）。
- 后续每加一个分页面就复制一套形状+DTO+装配逻辑；契约漂移无守卫。

## 2. 目标与非目标

**目标**
1. `packages/core/src/shared-kernel/domain/pagination.ts`（或 `cqrs/` 同级新文件）新增纯 TS 契约：
   - `PageRequest { limit: number; offset: number }`
   - `Page<T> { items: T[]; total: number; limit: number; offset: number }`
   - `createPage<T>(items, total, request): Page<T>` 工厂（消灭 adapter 手拼四字段）。
   经 `shared-kernel/index.ts` barrel 导出（框架无关·零依赖·与 AggregateRoot/DomainEvent 同居合理）。
2. `PlatformTenantPage`/`PlatformUserPage` 改为 `Page<PlatformTenantRow>`/`Page<PlatformUserRow>` 的**类型别名**（消费方 import 面不动，最小惊扰），domain port `list(opts: PageRequest & {search?})` 复用 `PageRequest`。
3. `apps/api/src/common/dto/list-page.dto.ts`：`ListPageDto` 基类（limit/offset 校验+默认值+Swagger 注解），`ListPlatformTenantsDto`/`ListPlatformUsersDto` 改 `extends` 只留 `search`。
4. 单测锁契约：`createPage` 形状测 + DTO 继承链校验元数据测（防装饰器继承坑，见 §7）。

**非目标**
- ❌ 给 posts/workspaces/subscriptions 补分页（响应数组→`Page<T>` 是**消费方 breaking 契约变更**，属行为变更非契约泛化，单独评估留后续·§6-甲）。
- ❌ 引入 `nestjs-paginate` 库（借思路不借库：其价值在统一契约，与库绑定的 filter/sort 语法糖本阶段无消费者）。
- ❌ cursor 分页（模板面向中小数据量，offset 够用；大列表需求出现再议）。
- ❌ 排序参数化 orderBy（YAGNI·各仓储现固定排序不动·§6-丁）。

## 3. 设计（决策完备）

### 3.1 契约层（core·纯类型零依赖）

```ts
export interface PageRequest { readonly limit: number; readonly offset: number; }
export interface Page<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}
export function createPage<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return { items: [...items], total, limit: request.limit, offset: request.offset };
}
```

### 3.2 消费改造（零行为变更）

- tenants/user governance domain：`export type PlatformTenantPage = Page<PlatformTenantRow>`（保留旧名作别名，port `list` 签名不动）；adapter 返回处换 `createPage(rows.map(...), count, opts)`——产出 JSON 逐字段同形。
- `ListPageDto` 基类（apps/api·class-validator/transform 依赖留应用侧，core 不引）：

```ts
export class ListPageDto { /* limit/offset 两组装饰器从现 DTO 逐字上移 */ }
export class ListPlatformTenantsDto extends ListPageDto { readonly search?: string; }
```

### 3.3 测试面（DB-free）

1. `createPage` 单测：形状/裁剪（items 复制非引用）。
2. DTO 继承链回归测：`class-validator` 对**继承的装饰器属性**须父类可被元数据遍历——以 `validate()` 实跑断言（limit=101 报错、继承属性同校验生效），防"Nest validator 丢父类属性"类坑。
3. 既有 platform adapter list 单测全数保留不改断言（同形即绿=回归守卫本尊）。
4. boot 冒烟/CI 基线 297/13 → 预计 +3~4 passed。

## 4. DoD

- [x] core 契约导出·`@core/shared-kernel` 消费链路 tsc 通。
- [x] 两处 Page 别名化 + 两处 adapter 换 `createPage`，既有单测零改断言通过（同形铁证：4 文件 23 测全绿）。
- [x] `ListPageDto` 继承链校验实跑测绿（§7 雷未踩中：whitelist+forbidNonWhitelisted 同参实跑，父类装饰器可读回）；两个 platform DTO 只剩 search。
- [x] CI 全绿新基线入账（**304/13**·+7：契约 3 + DTO 4）·0 边界违规·biome 修复面核验 S9 值导入未回吸。
- [x] plans/README 本行翻状态；业务面补分页留后续候选（甲裁·见 v0.2）。

## 5. 里程碑对照

shared-kernel 加纯类型 = core 公共面增量，无端口倒置冲突（core 外部依赖仍仅 peer/node）。

## 6. 未决事项（待人裁·附建议）

- **甲 · 范围**：本片仅"契约泛化+platform 两面换源（零行为变更）"，业务面（posts/workspaces）补分页留后续单独评估？——**建议是**。理由：数组→Page<T> 是消费方 breaking change，混入泛化片会让"零行为变更"的安全属性破功；且各面消费者（前端示例/openapi）需逐面盘点。
- **乙 · 旧名去留**：`PlatformTenantPage`/`PlatformUserPage` 删除换新名，还是留作 `Page<XxxRow>` 类型别名？——**建议留别名**。消费方（controller 返回类型/read-model re-export/query handler 泛参）六处 import 面不动，diff 最小；未来新面直接用 `Page<T>`，旧名随重构自然淘汰。
- **丙 · `createPage` 工厂**：要不要（vs 继续手拼四字段）？——**建议要**。一处构造=形状纪律所在；items 浅复制防 adapter 引用泄漏；单测可直接锁工厂。
- **丁 · 排序参数化**：`sort` 查询参数本片引入？——**建议不做**。无消费者，且开放 sort 入参需白名单校验（防列名注入面），等有真实需求随业务面分页片一并设计。

## 7. 风险与回退

- **class-validator 继承坑**（唯一技术雷）：Nest `I18nValidationPipe` 走 `whitelist+forbidNonWhitelisted`，若父类装饰器属性读不回会**整体 400 化**（limit/offset 被当非白名单拒）——§3.3-2 实跑测直接覆盖此面，失败即弃继承改组合（备选：DTO 显式重声明两字段+基类只留文档，仍消形状重复于 port 层）。
- 零 JSON 形状变更=对外契约零风险；回退 revert 即净退（纯类型面+两 DTO）。

## 8. 演变记录

- 2026-10-14 v0.1: 依人裁「1」立项起草。勘察坐实：两 page 形状同构重复、两 DTO 逐字段重复、业务面全量返回现状、shared-kernel 落点（纯 TS barrel 已出口）、users.findAll 非本次范围。§6 甲乙丙丁待裁。
- 2026-10-14 v0.2: 人「同意」过门——甲乙丙丁照建议（业务面分页留后续；旧名留别名；createPage 工厂要；sort 不做）。
- 2026-10-14 v0.3: 实现完成。契约落 `shared-kernel/domain/pagination.ts`（PageRequest/Page<T>/createPage·barrel 导出）；两 domain 旧名改 `Page<XxxRow>` 别名（port 签名复用 PageRequest）；两 adapter 尾行换 createPage；`ListPageDto` 基类落 `apps/api/src/common/dto/`。实现期小注：`validateSync` 无 `transform` 选项（转换属 plainToInstance 层，测内剔除后语义不变）。既有 adapter 单测零改断言全绿=同形铁证；§7 class-validator 继承雷实跑未踩中。
- 2026-10-14 v0.4: 人「同意」验收→**结项**。零行为变更承诺经同形铁证坐实；业务面分页 / sort 参数化 / cursor 均为甲丁缓行项（未入本批）。softkit 借鉴线三项（#1 探针、#2 分页、#3+核仓观察项）至此全部收口。
