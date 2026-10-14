# 技术方案 · 请求关联 id 统一链（correlationId 断链修复）

> 状态: **已验收·结项**（人验收 2026-10-14·commit `d026949` + 落位修订 `9a94af5`·验收时基线 CI 320/13，随后被错误契约片推至 327/13）| 读者: **Agent**（历史开发依据·已归档）
> 修订: **v0.5 验收结项**；v0.4 验收修订——应裁将 `request-context` 归拢至 `shared-kernel/context/` 目录（横切契约落位纪律同步成文 tooling §4.9·同批签核），12 处 import 刷新，语义零变；v0.3 实现订正——hook e2e 以零 DB 真 Fastify inject 集成测 + 实机 curl 四证替代，事件穿透测覆盖 3/4 构造点（reject-handler 同形未单测）
> blast radius: **跨面小中片**（main.ts 一枚 Fastify hook + core shared-kernel 加纯 ALS 上下文 + 4 处事件构造点补 `correlationId` + interceptor 换源 + CORS expose·**零 schema·零既有响应形状变更**·新增一枚响应头）
> 缘起: softkit-core `libs/async-storage` 评价（2026-10-14）照出本仓三点断链实证——①`LoggingInterceptor` 自造 `req-${now}-${Math.random()}` 只活在日志字符串（连 Fastify 原生 `req.id` 都没用）；②`DomainEvent.correlationId` 契约字段 + event 表持久化列都在，但 **4 处构造点无一传值、恒落 null**（契约有孔无源）；③请求/日志/事件三者无共同 id 可串。ES 路线（Phase B 在跑）将来必补的一环，本轮立项。

## 1. 背景与既有事实（勘察坐实）

- `tenantStorage`（`libs/core/src/tenancy/tenant-context.ts`）：`AsyncLocalStorage<TenantContext>` 纯 node 实现，`tenant.middleware.ts` 内 `run(ctx, next)`——**依赖会话解析，覆盖面仅限租户链**，不适合搭载 request id（health/旁路面也要有 id）。
- 事件构造 4 点：`reject-tenant.command-handler` / `user.aggregate` / `tenant-status.service`(core) / `user-status.service`(core)——两处在 **libs/core**，故 request 上下文必须落 core（S10 不变量：core 零反向 import `@app/*`），apps/api 放 holder 会直接堵死 core 读源。
- `LoggerService` = 自研 pino 包装单例（无 per-request child binding）。
- main.ts 已手动取 Fastify 实例注册插件（compression/helmet/cors/multipart）——hook 有现成落点。

## 2. 需求

- **FR-1** 每请求一个关联 id：入站带 `x-request-id` 则透传（网关/前端复用），否则 Fastify 原生 `req.id` 生成；**所有路由无例外**（含 /health 旁路面）。
- **FR-2** 出站回写 `x-request-id` 响应头；CORS `exposedHeaders` 补该头（前端可读）。
- **FR-3** id 进入请求生命周期 ALS：同请求的 guard/interceptor/handler/service 任意深度可读。
- **FR-4** 4 处领域事件构造点补 `correlationId`（HTTP 请求内非空；后台/脚本场景允许 null——既有 `?? null` 持久化语义不动）。
- **FR-5** `LoggingInterceptor` 弃自造随机 id，改读统一源。
- **非目标**：OTel/W3C `traceparent` 全链路追踪、pino per-request child 结构化绑定、跨服务传播（队列/HTTP 出站携带）——见 §5 丙/丁。

## 3. 方案设计

### 3.1 core 上下文（FR-3 的依赖方向解）

`libs/core/src/shared-kernel/request-context.ts`（新增·纯 node·仿 tenant-context 先例）：

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  readonly requestId: string;
}

export const requestStorage = new AsyncLocalStorage<RequestContext>();

/** 任意深度读当前请求 id；请求上下文之外（后台任务/测试）返回 undefined。 */
export function currentRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}
```

barrel 导出；`DomainEvent` 契约与 shared-kernel 同居一区，依赖方向干净（handler/service 构造事件时 `correlationId: currentRequestId()`）。

### 3.2 apps/api 接线（FR-1/2/3 单点落位）

main.ts 取到 Fastify 实例后、`listen` 前注册 **onRequest hook**（先于全部 Nest middleware/guard/拦截器，天然覆盖旁路路由；Fastify 单请求生命周期同处一条 async chain，hook 内 `requestStorage.run(...)` 包住后续全链）：

```ts
fastifyInstance.addHook('onRequest', (req, reply, done) => {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? req.id;
  reply.header('x-request-id', requestId);
  requestStorage.run({ requestId }, done);
});
```

CORS 注册处 config 补 `exposedHeaders: ['x-request-id']`。

### 3.3 interceptor 换源（FR-5）

`LoggingInterceptor` 删 `Math.random` 自造行，改 `currentRequestId() ?? request.id ?? 'req-unknown'`——日志行 `Request [id]` 与响应头/event 表同一 id。

### 3.4 事件构造点（FR-4）

4 处 `new XxxEvent({...})` 各补一行 `correlationId: currentRequestId()`。签名零改（备选"命令显式传参"见 §5-丁 否决理由：动全部 command/handler 签名，侵入远超收益，且后台任务无命令入口）。

## 4. 测试

- `request-context.test.ts`（core）：store 内外读写、undefined 边界。
- hook 行为单测：以 mock req/reply/done 直调——入站透传优先、缺省取 `req.id`、响应头写回、ALS run 包裹 done。
- interceptor 测：断言不再随机造 id、读 ctx 源。
- 既有 4 构造点相关单测：补 `correlationId` 从 store 读到的断言（run 一个假 store 验证穿透）；store 外为 undefined（后台语义不变）。
- gated e2e（真 HTTP）：响应头 `x-request-id` 存在且透传值被复用。
- app-boot 冒烟不受影响（hook 注册在 HTTP 层）。

## 5. 待裁（甲乙丙丁）

- **甲 · id 载体**：Fastify `onRequest` hook 一处完成三事（定 id/回写头/run ALS），不加 Nest middleware——**建议：是**（hook 先于一切 Nest 层且覆盖旁路，Nest middleware 做不到 /health）。
- **乙 · 载体落点**：request context 放 `shared-kernel`（非 tenancy 目录·不并入 TenantContext store）——**建议：是**（request id 与租户无关，并 store 会把「租户墙才 run」的生命周期耦合进来）。
- **丙 · traceparent/W3C**：本层只 `x-request-id`，不引 `traceparent`——**建议：不做**（无分布式拓扑，引了是死码；微服务挂账触发时再设计）。
- **丁 · correlationId 传参方式**：构造点从 ALS 读，不改 command/handler 签名——**建议：是**（同上；显式传参侵入全部命令面且后台任务无入口）。
- **戊 · pino child 结构化绑定**：interceptor 字符串级统一 id 即可，`logger.child({requestId})` 全链路透传——**建议：缓行**（需 per-request logger 传递机制，改动面扩散到全部 service 签名或二次 ALS，留可观测性片统一评估）。

## 6. 影响面与回滚

新增 2 文件（core 上下文 + hook 测试）、改 6 文件（main.ts/interceptor/CORS config 位/4 事件构造点·其中 2 处随 barrel）。新增一枚响应头 = 纯增面；event 表 `correlation_id` 列已存在零迁移。回滚=revert 单 commit。

## 7. DoD

- [x] core 上下文 + barrel + 单测（store 内外两态）。
- [x] hook 落地：透传优先/缺省 req.id/回写头/ALS 包裹全链；CORS expose。
- [x] 4 构造点 correlationId 穿透断言坐实（HTTP 内非空·store 外 undefined）——直接测覆盖 3 构造点（user.aggregate/tenant-status/user-status），reject-handler 同形由样本机制覆盖（如实登记）。
- [x] interceptor 换源，无随机 id 残留（两次调用恒等断言）。
- [x] 响应头断言：零 DB 真 Fastify 真异步链集成测（补 mock-done 单测盲区）+ 实机 curl 四证（缺省 `req-1`/透传 `my-trace-123`/CORS expose/旁路面覆盖）代替 gated e2e（登记订正见 v0.3）；CI 全绿 **320/13** 新基线入账。

## 8. 演变记录

- 2026-10-14 v0.1: 依人裁「1」立项起草。勘察坐实：三点断链（interceptor 随机 id 孤岛/event 契约有孔无源/Fastify req.id 未用）、tenantStorage 载体不适用、core 依赖方向决定上下文落 shared-kernel、4 构造点清单。§5 甲乙丙丁戊待裁。
- 2026-10-14 v0.2: 人「同意」过门——甲乙丙丁戊照建议（hook 单点载体；独立 request-context 落 shared-kernel；不引 traceparent；ALS 读源不改命令签名；pino child 绑定缓行）。
- 2026-10-14 v0.3: 实现完成。新增 core request-context + apps/api 可测 hook 文件（独立于 main.ts 内联）；main.ts addHook + CORS 调用点 spread 补 exposedHeaders（registry 无既有键，只增不改）。订正登记：①§4 原计划 gated e2e 响应头断言改为**零 DB 真 Fastify inject 集成测**（证 ALS 对真异步链穿透——mock done 单测的盲区）+ 实机 curl 四证，既有 gated HTTP e2e harness 不走 main.ts 装配、与其测 hook 不如测真链；②穿透直接测覆盖 3/4 构造点，reject-handler 行同形未单独加测。测试两处断言修正（同步 subscribe 下 Response 行穿插；整行内容非纯 id）。
