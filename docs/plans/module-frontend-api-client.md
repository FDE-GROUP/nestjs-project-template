# 前端 F1 · api-client：@saas/api-client  typed 客户端 + OpenAPI 响应契约补全（呈审稿）

> 适用范围: `前端 × 后端契约面`（F1 切片）| 受众: 人（审计/裁点）
> 关联: `global-frontend-adoption` §2.2-F1（总纲已批范围）· `module-common-error-response-contract`（码表预留）· `specs/tooling-standards.md` §4.12 · `specs/architecture.md`（packages/=可交换）
> 性质: 首版（总纲分片落地稿，不改总纲已批措辞）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

总纲 §2.2 承诺 F1 =「`packages/api-client` 从 `openapi/openapi.yaml` 生成 typed client（复用 openapi-codegen 链）+ errorCode 码表做实」。本片是其呈审稿。

**勘察实据（2026-10-17 对拍，数字均实测）**：

- **契约缺口（本片核心矛盾）**：`openapi/openapi.yaml` 32 paths / 39 ops，**响应 schema 覆盖 = 0**（全部响应 `description: ''` 无 content）；`components.schemas` 仅 11 个请求侧 DTO。直接对拍生成 → typed client 的响应全 `unknown`，**"typed" 即虚言**。缺口系历史留账：`global-readiness-error-pagination` v0.2.0 明载「本片不动 OpenAPI 文档注解（挂账项：前端集成期用官方 `@ApiResponse` 呈现错误契约）」——F1 正是"前端集成期"。
- **码表已在单源**：`libs/core/src/shared-kernel/errors/error-codes.ts` `ERROR_CODES` 29 码（`NAMESPACE:NAME` 冒号文法·契约测试双向锁定·文件头原文即写「跨前后端（api-client）的稳定机器标识契约」）——「码表做实」的**声明面已就绪**，F1 消费面 = api-client 透出判别原语，**不新造第二码表源**。
- **成功形状单源**：`TransformInterceptor` 恒定 `{ data, statusCode, message }`（分页形 `{ data, meta, … }`）——envelope 可一次手写、精确对拍 filter/interceptor 源码。
- **BA 面不可达**：39 ops 中 5 个挂 `/api/v1/better-auth/*`（Better Auth 框架自挂载、不经 Nest controller），**Nest 注解补不了其 schema**——待裁点②。
- **生成器候选 registry 可得**（npmmirror 对拍 2026-10-17）：`openapi-typescript@7.13.0`、`openapi-fetch@0.17.0`、`@hey-api/openapi-ts`（代际可用）、`@openapitools/openapi-generator-cli@2.41.0`（需 Java 重炮）。

目标：`packages/api-client` 成为**真 typed** 的契约消费制品——类型从 OpenAPI SSOT 生成、envelope/错误形状与 filter/interceptor 实存对拍、经 `@saas/api-client` 名兑现总纲 §2.3③ 已裁命名。

**非目标**：不改后端运行时行为（注解纯 additive 文档面）；不重构 apps/web `auth.ts` 门面接入（留 F2，避免动已验收交付）；不做后端部署面；不动 schema/迁移。

## 2. 方案

### 2.1 契约补全（后端注解 · 纯 additive）

- 后端各 controller 逐路由补 `@ApiOkResponse/@ApiCreatedResponse`（+ 必要 `@ApiExtraModels`）挂 DTO 类型；分页路由挂 `PageDto/CursorPage` 泛型形。
- envelope 与错误形状（`{message, errorCode?, requestId, …}`）以 `@ApiExtraModels` + 显式 schema 引用呈入 OpenAPI。
- 补后重跑 codegen 链（`openapi-codegen.ts` → `openapi/openapi.yaml`），**字节级对拍进 L1**（`ci.ts` 加一步，先例 = `global-readiness-initial-slice`「codegen 字节级一致」判据）。

### 2.2 `packages/api-client`（@saas/api-client）

- 产出物四件：
  1. `types generated`：`openapi-typescript` 从 `openapi/openapi.yaml` 生成 `schema.d.ts`（生成物提交入库，同 routeTree.gen 惯例）；
  2. `client`：`openapi-fetch` 实例工厂（basePath `/api/v1`、`credentials: 'same-origin'`、可注入 fetch——同源反代下 web 零绝对 URL）；
  3. `errors`：从 `@core/saas-kit` re-export `ERROR_CODES/ErrorCodeValue`（workspace 依赖·**单源不复制**）+ 判别原语（`isErrorCode(res, code)` / `ApiError` 窄化）；
  4. `envelope`：`ApiEnvelope<T> / PageEnvelope<T>` 手写契约类型，附**对拍锁测**（断言与 `TransformInterceptor`/`HttpExceptionFilter` 实存形状字段一致，防静默漂移）。
- 测试：Vitest 纯逻辑（mock fetch 断言 URL/凭证/错误窄化），进根 vitest include；Biome 根覆盖。

### 2.3 待裁点（呈审时逐条裁，未裁不动）

- **① 契约补全范围**：**甲 = F1 一次补全 34 个 Nest ops**（推荐——消「typed 半虚言」，改动纯装饰器 additive）；乙 = 只补 F2 自助域（users/workspaces/tenants/subscriptions/posts ≈21 ops），其余缓账；丙 = 本片不补、api-client 只建 envelope/errors 骨架（paths 类型仍缺，**不推荐**，属 overclaim）。
- **② BA 面 5 ops**：甲 = api-client 内手写 BA 契约类型并注明「框架自挂载、非 OpenAPI SSOT 成员」（推荐——auth.ts 已有实机真值注记可迁移升格）；乙 = F1 整体排除 BA 面（F2 再议）。
- **③ 生成器选型**：**openapi-typescript + openapi-fetch**（推荐：TS 原生轻装·无 Java）；备选 @hey-api/openapi-ts（一体但重）。`openapi-generator-cli` 因 Java 依赖与 npmmirror 环境不符**不列**。
- **④ codegen 对拍进 `ci` 链**：进（推荐·防漂移 fail-loud）/ 只作 verify:* 手动脚本（若人嫌 L1 变重）。

## 3. 影响面与风险

- **blast radius**：`packages/api-client` 新建 + `pnpm-workspace.yaml`（packages 收纳）+ 后端 controller 注解（**零运行时语义**·34 文件级触点若裁甲）+ `openapi/openapi.yaml` 再生成 + `scripts/ci.ts` 一步（若裁④进链）。**不改**：apps/web 已验收面、schema/迁移、Dockerfile/compose、husky/commitlint。
- **命中高危清单**：注解与 `ci.ts` 属实现面非宪法；§4.12 已在总纲批准时入宪，本片无需再修宪。
- **回滚**：api-client 删除即净；注解 revert 即净；openapi.yaml 回退重生成即一致。
- **主要风险**：泛型分页 DTO 在 @nestjs/swagger 的元数据退化（`PageDto<T>` erasure→`Object`）——需以 `SchemaObject` 显式形或具体化 DTO 应对，实施首日 spike 验证，拓不动则登记 §6 并逐路由降级为具体 DTO；npmmirror 新包可得性已对拍③候选（实施首日复核锁版）。

## 4. 审计记录

> 无已审方案不写码。契约面跨前后端 → 人签核。

- 结论：**待审计**——待裁点 ①②③④。
- 未决项：即待裁点。
- 审计人 / 日期：— / —。

## 5. 完成判据（可核验 + 穷尽）

- [ ] §2.3 四待裁点获人裁定
- [ ] `pnpm run gen:client`（或对应链）产出 + `openapi/openapi.yaml` 与实跑 codegen 字节级一致
- [ ] `@saas/api-client` 构建通过；errors 单源锁测绿（re-export 与 `@core/saas-kit` 恒等）；envelope 对拍锁测绿
- [ ] apps/web **零改动**（F0 已验收面不动·防验收回退）
- [ ] `pnpm run ci` L1 全绿（基线 529/31·90 files 只增不减）
- [ ] 人类验收

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 总纲 F0 验收结项后按 §2.2 串行呈 F1 | 首版呈审：契约缺口实据（0/39 响应 schema）+ 码表单源确认 + 四待裁点 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 起草（**呈审·待审计**）；发现登 §6 不入正文。
