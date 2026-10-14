# 技术方案 · BA HTTP 面接线（better-auth 原生端点整面 404 核验与修复）

> 状态: **已验收·结项**（实现见 §4 v0.3·甲1+乙1+丙+丁 gated+戊照裁·验收登账见 v0.4）| 读者: **人**（审计/验收用）
> 缘起: module-auth-ip-trust（e46d2c7）实机副产观察·人裁"同意"顺带立项（2026-10-14）。
> blast radius: `auth.controller.ts`（stub 面处置）・`auth.middleware.ts`/`auth.module.ts` 或 `main.ts`（接线一处）・零 schema・零业务模块

## 1. 背景与实锤（实机 + 代码双取证）

1. **BA 原生 HTTP API 面整面不可达**：实机四探全 404（`POST /api/v1/auth/sign-up/email`、`POST /api/v1/auth/sign-in/email`、`POST /api/v1/better-auth/sign-in/email`、`GET /api/v1/better-auth/get-sessions`）；404 体为 Nest 路由层 `Cannot POST ...`（我方异常过滤器格式）= **请求根本没进 BA handler**。
2. **上轮"session 200=装配健康"判读作废（自纠）**：`GET /better-auth/session` 200 实为 `AuthController` 空 stub（`async getSession() {}` 返回 undefined），BA 未参与。诚实基线：当前无任何 BA 端点经 HTTP 可达。
3. **根因结构**：BA handler 仅由 `AuthMiddleware` 转发，而中间件 forRoutes 模式（`'*prefix/auth/*path'` 等 Express 通配）在 Nest 中**只绑定到已注册路由**——`/api/v1/auth/**` 下无任何 Nest 路由提供，router 先 404、中间件永不得跑。stub controller 挂在 `/better-auth` 且只有五条死路由（含 `console.log` 遗留）。
4. **为何 CI 从未暴露**：tenancy e2e 登录全走 `authApi()`（服务端 SDK 直调 `signUpEmail/signInEmail`），不经 HTTP——gated e2e 绿不证明 HTTP 面可用（本缺口的"测试盲区"实锤）。
5. **BA basePath 错位先存**：`CreateAuth` 生成 `basePath = /api/v1/auth`，而 stub/文档面向 `/better-auth`——handler 内部按 basePath 匹配，两者必对齐其一。
6. `better-auth` 包无 `./fastify` 官方导出（package.json 实查零）= 官方 Node 通道只有 `toNodeHandler`；社区两式：Nest catch-all `@All` 控制器 或 Fastify 实例级 `all()` 路由。

## 2. 方案（裁决点）

### 甲 · 接线形态（核心·二选一）

- 甲1（推荐）：**Fastify 实例级通配路由**——`main.ts`（或 AuthModule onApplicationBootstrap 经 HttpAdapterHost）对 `/{prefix}/{version}/auth/*` 注册 `all` 处理器直调 `toNodeHandler(auth)`。理由：绕开 Nest router/guard/validation 三层魔法，与 BA"原生 handler 吃 raw req/res"的形态最贴合；`@Public` 语义天然满足（不注册即不进全局守卫）；stub 面可独立拆除互不干扰。风险：需实证 Fastify 通配语法（`*` vs `{*path}`）与 Nest Fastify adapter 共存顺序（spike 项）。
- 甲2：Nest `@All('{*path}')` catch-all controller 转发 handler。理由：纯 Nest 惯用法；但需 `@Public()` 旁路全局会话墙 + 绕开 ValidationPipe 对 unknown 路径的干扰，魔法层更多。

### 乙 · 挂载前缀对齐（二选一）

- 乙1（推荐）：**维持 basePath=`/api/v1/auth`**（中间件 forRoutes 的历史设计意图、`CreateAuth` 现值零改动），甲的接线面即挂这里。
- 乙2：basePath 改 `/api/v1/better-auth`（贴 stub 旧语义）——不推荐：改 BA 配置面牵 secret/回调 URL 生态，且 `/better-auth` 命名本就来自早期模板遗留。

### 丙 · stub 死面处置

**五 stub 全删**（`GET/POST/DELETE token`、`GET session`、`GET providers`）：全部为占位死码（console.log/空返回），接线完成后 providers/session 等 BA 原生端点（`/get-providers`、`/get-session`）覆盖同语义——留之即名实干扰。附带：`AuthMiddleware` 若接线后无消费方则整体删除（勘察其唯一职责=handler 转发）；`AUTH_BYPASS_PATHS` 等常量随之清算。

### 丁 · 测试账（DoD）

1. **HTTP 面 e2e（本片核心产出）**：真 HTTP 全链 sign-up → sign-in（取 cookie）→ get-session → sign-out → 再 get-session 失效，dev env（emailAndPassword 非生产启用）下跑；进 env-gated 先例体系还是无条件 CI——**待裁**（建议：gated 起步，避免 CI 对 DB 的既依赖扩面）；
2. stub 删除后的元数据/编译序连带修正（providers stub 有 `getProviders` 消费方？全仓 grep 实锤后再删）；
3. 实机三态取证：接线前 404（已存照 §1-1）→ 接线后 200/401（BA 语义）→ 非法路径仍 404；
4. ip-trust 片遗留观察闭环：plan v0.3 第 3 条划掉登记。

### 戊 · 明确不做

- 生产 `emailAndPassword.enabled=false` 的登录面补齐（D8 CN 登录排序·独立产品决策）；
- genericOAuth 回调面 HTTP 可达性（同缺口但渠道配置另片）；
- SessionGuard 对 BA 面的语义（甲1 下天然不进墙；甲2 才需处置）。

## 3. 风险与前置 spike

- **Spike（实现前必做）**：Fastify 实例级 `all('/api/v1/auth/*')` 在本仓 NestJS 12 + Fastify 5 adapter 下的注册时机与通配语法实测；`toNodeHandler` 对 Fastify raw req/res 的兼容（handler 已 `res.header()` 用法存照，理论兼容，实测为准）。
- 接线即**扩大攻击面**（BA 全端点上线）：限流已由 ip-trust 片显性化；CORS/CSRF（BA 自带 origin 校验）无需新增——登记审计日志即可。

## 4. 演变记录

- v0.1（2026-10-14）：初稿待审计。自纠一处：ip-trust 验收呈报中"session 200=装配健康"系误判（stub 空路由），本片 §1-2 已钉正——教训留痕：**判"装配健康"须以业务语义端点响应形态为准，非状态码孤证**。裁决点：甲1 Fastify 实例级接线（推荐）/ 乙1 维持 /api/v1/auth basePath（推荐）/ 丙 stub 全删 + 中间件清算 / 丁 gated e2e 起步（待裁）/ 戊缓界三条。
- v0.2：人审通过（"同意"·2026-10-14），甲1 + 乙1 + 丙 + 丁（gated 起步照建议）+ 戊 全照建议。
- **v0.3（实现登记·四处实机钉穿的方案期认知偏差 + 一处基准订正）**：
  1. **spike 实锤·通配语法**：本仓 find-my-way 9.10.0 仅支持**裸尾 `*`**（`/{prefix}/v1/auth/*`），`{*name}` 语法启动即崩 `Wildcard must be the last character`（/tmp 最小复现钉死）。接线形态落地为 `AuthBootstrapService`（onApplicationBootstrap 经 `HttpAdapterHost` 对 Fastify 实例 `app.all(pattern)`），非 main.ts——属甲1 括注许可的第二形态，装配逻辑（social providers/generic configs/CreateAuth/authInstance.set）自原 AuthMiddleware 整体迁入。
  2. **乙1 基准订正（如实登记，非静默修正）**：§1-5/乙1 声称 "CreateAuth 现值 `/api/v1/auth` 零改动" **读错**——现值实为 `/${apiPrefix}/${appConfig.version}/auth` = `/api/1.0/auth`（文档版本 '1.0' 误入路径，与 main.ts `enableVersioning({defaultVersion:'1'})` 不同源），系整面 404 的第二层先存缺陷（即使中间件能唤起也挂错址）。订正为 `/${apiPrefix}/v1/auth`——乙1 的目标路径不变，但"零改动"不成立，实为**改值订正**。
  3. **Express 兼容层退役（实机 500 钉穿）**：`auth.implement.ts` handler 内 `req.url = ...`/`req.originalUrl = ...` 回写在 Fastify 下抛 `Attempted to assign to readonly property`（两者均原型只读 getter）→ 整段删除，仅留 url 缺失 fail-loud；实例级接线递来的 raw.url 即完整路径，BA 自剥 basePath。旧日志 `res.header is not a function` 噪音佐证该兼容层在中间件时代本已半死。
  4. **body 挂回桥（better-call 库源码取证）**：Fastify 预解析消费 raw 流后 better-call node 适配器走 `maybeConsumedReq.body !== void 0` 兼容分支（`dist/adapters/node/request.mjs` L102-112 序列化回放）→ 桥内 `raw.raw.body = raw.body` 挂回即通（初测 `[body] expected object, received undefined` 钉出）。
  5. **BA 语义两条实机钉明**：①cookie 写操作（sign-out 等）CSRF 要求 `Origin` 头，否则 403（带 origin 复测 200）；②注销后 `get-session` 返 **200 + body null**（非 401）——psql 查 session 行判明失效真实生效，e2e 断言按真语义写 `toBeNull()`。
  6. 丙落地：`auth.controller.ts`（五 stub）与 `auth.middleware.ts` 整删；`AUTH_ALLOWED_METHODS` 删、`AUTH_BYPASS_PATHS` 删三 `/better-auth/*` 死项（存 health/apidoc/openapi·唯一真消费方 AuthSessionReader 不可整删）；`public.decorator.ts` 例示与 `session.guard.ts` 注释随之清算。
  7. 丁落地：`auth.bootstrap.test.ts` ×2（pattern 裸尾 `*` 锁 + 兜底 500 行为契约；初版第三测不成立删除——CreateAuth 内部 catch 吞错不外抛）；`auth-http-surface.e2e.test.ts` ×3（`E2E_DATABASE_URL` gated·`app.inject` 对齐先例·真库 nestjs_e2e 跑 3/3 绿·文件末本地跑法注）；实机三态全存照：接线前 404（§1-1）→ 接线后 sign-up/in/get-session/sign-out 全 200 真 DB 行 → 非法 BA 子路径 404（Content-Length 0 真 404 非 500）+ stub 面 404（e2e 锁）+ health 200。
  8. **Biome autofix 复刻 S9 坑**：`biome check --write` 把仅类型位的构造依赖（ConfigService/DrizzleService/QuotaService/HttpAdapterHost）擦成 `import type` → DI 运行时 UnknownDependenciesException（app-boot.smoke 红）→ 五依赖全改显式 `@Inject(X)` 值用法修复，复跑 "No fixes applied" 稳住。
  9. **CI 327 passed | 16 skipped (343 总)·Local CI PASSED**（基线 328 + 单测 2 + gated e2e 3[默认 skip·16=13+3]）；ip-trust 片遗留观察（其 §4 v0.3-3）由本片闭环，已回记该 plan。
  10. 实现期订正三处（e2e 文件）：import 路径深度 `'../'→'../../'`；`getHttpServer().inject` → `app.inject`（NestFastifyApplication 先例形态）；cookie 正则按真名 `/better-auth\.session_token/i`。
- **v0.4（人验收结项·2026-10-15·commit `eb2bbbf`）**：验收面实机三态全存照（接线前 404→接线后全链 200 真 DB 行→非法 BA 子路径真 404/stub 面 404/health 200）；CI **327 passed / 16 skipped（总 343）** 新基线（提交前+pre-push 双验 PASSED）；ip-trust 片遗留观察闭环（其 v0.3-3 划账）。遗留处置：真库 nestjs_e2e 保留复用（不 DROP·本地 gated e2e 专用设施）；dev 服停；缓账照戊：生产 emailAndPassword 登录面（D8 另片）、genericOAuth 回调 HTTP 可达性（另片）。记忆：新立本片接线决策档 + 六坑陷阱档 + 缺口记录/CI 基线更新（六坑单条重复档已并除）。
