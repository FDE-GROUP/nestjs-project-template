# 请求限流基线（module-common-rate-limit）

> 适用范围: `全局`（横切基线·blast radius=全部 Nest 路由）
> 关联: `module-auth-ip-trust`（BA 信任链先例·同故障模式）· global-tenancy §9.3（双层全局墙先例）· 借鉴评估（nestjs-saas-tenant-boilerplate 对照·唯一净缺口）
> 性质: 新立项

## 1. 背景与目标

**据实盘点（2026-10-17 勘察坐实）**：

- BA 内置限流已护认证面：`rateLimit: { enabled: true }`（auth.implement L214·敏感路径 3次/10s 默认）+ `AUTH_TRUSTED_PROXIES` IP 信任链（module-auth-ip-trust·commit e46d2c7）。**但该面是 Fastify 实例级 `all('/api/v1/auth/*')` 通配路由（AuthBootstrapService 接线），不经 Nest 守卫链**——Nest 侧限流器天然盖不到，也不需要（已有专属护）。
- **我方全部 Nest 路由零防护**：全仓 grep `throttle|rate-limit` 零命中（仅 main.ts FastifyAdapter `{ logger: true }`）。爆破/刷量面：成员邀请发信、租户数据导出、posts/workspaces 读面、平台治理列表。
- **Fastify 未开 `trustProxy`**：Throttler 默认 tracker 取 `req.ip`＝socket 远端——反代后全量用户共享单桶，**重演 BA 已修过的整站误杀事故**（记忆坑 4b94bc5a）。

**目标**：Nest 路由面立「deny-by-default 限流墙」，与 BA 面「各护各面、信任链单源」收口。
**非目标**：不覆盖 BA wildcard 面（BA 自有限流）；不引入 Redis 分布式存储（单实例进程模型·cluster 零命中）；不做 seats 配额（那是业务准入非请求限流·已有 @Quota）。

## 2. 方案

- **引擎（甲裁）**：`@nestjs/throttler` 全局墙（实机安装 **6.7.1**·起草时拟 v7.x 订正：v6 即 Nest 12 当前主线）——`@Throttle()`/`@SkipThrottle()` 装饰器与既有 `@Public`/`@TenantExempt`/`@Can`/`@Quota` 声明模式同构，Reflector 元数据旁路单一声明点。备选 `@fastify/rate-limit`（实例级插件）被否理由：无 Nest 路由元数据语义、无法按 `@SkipThrottle` 豁免、与 BA 面重叠需双层配置漂移。
- **接线形态（甲裁）**：独立 `RateLimitModule`（ThrottlerModule.forRoot + APP_GUARD）注册于 **AppModule imports 首位区（AuthModule 之前）**——执行序 = 限流(最廉价拒绝) → 会话墙(401) → 租户墙(403)，防爆破流量先吃掉 getSession 成本。豁免面：`@SkipThrottle()` 挂 health 面（探活/CI verify-prod-boot 不得被锁）；`/api/v1/auth/*` wildcard 不经此墙（事实非豁免）。
- **IP 信任链（乙裁）**：FastifyAdapter `trustProxy` 选项复用 **`AUTH_TRUSTED_PROXIES` 单源**（不新增 env 键、不双链漂移）；Fastify 5 CIDR 数组语义实现期实机对拍；生产缺配沿用 ip-trust 先例「warn 显性化非 fail-closed」。
- **窗值（丙裁）**：全局默认 **300 次/60s·IP（宽档：主挡脚本级洪水、几乎不误伤重前端并发拉取）**；邀请/导出等昂贵面逐端点 `@Throttle` 收紧**本片不做**（机制就位、具体收紧档数值未裁→登记缓账，不臆测）。
- **存储（随工默认）**：内存 storage；`throttler-storage-redis` 不引入，多实例扩容时另立项（Redis 定位=基建非缓存记忆不阻塞此路径）。

**切片**：
1. S1 依赖 + 全局墙接线 + health 豁免 + 信任链同源 + 窗值落案 —— 完成判据：app-boot.smoke DI 绿、单测锁守卫执行序与豁免元数据。
2. S2 锁测 + 回归 + 门禁 —— 完成判据：限流矩阵单测（deny 429/retry-after/`@SkipThrottle`/tracker key 形）、gated e2e 真 HTTP 打穿 429（含反代 XFF 头对拍）、`pnpm run ci` 全绿基线 416/30 只增不减。

## 3. 影响面与风险

- **blast radius**：全局守卫新增（ deny-by-default 会拒绝超阈值真实流量——窗值裁量即风险面）；**高危命中**：新依赖 + 全局门禁形态 + 可能动 `.env`（若新增限流相关 env 键）→ 须人签核。无 schema 变更、不触 migrate。
- **测试坑预防**（记忆 e7d5c9b5）：既有守卫矩阵测 ExecutionContext mock 需补 `getHandler/getClass`。
- **回滚**：移除 APP_GUARD 注册与 import 即恢复原状（可逆·纯加法）。

## 4. 审计记录

- 结论：**已审计·GO**（人签核 2026-10-17·AskUserQuestion 四裁）——甲=《@nestjs/throttler 全局墙》（APP_GUARD·AuthModule 前·限流→401→403）；乙=《复用 AUTH_TRUSTED_PROXIES》（FastifyAdapter trustProxy 单源不新增 env 键·生产缺配 warn）；丙=《300 次/60s·IP 宽档》（昂贵面逐端点收紧未裁→缓账不臆测）；丁=《高危随片签》（新依赖+全局守卫形态；未涵盖 docs/specs 修宪——architecture 限流条款另签，本片只动 plan/README）。
- 未决项：Fastify 5 `trustProxy` CIDR 数组语义实机对拍（实现期锁测）；邀请/导出面收紧档数值（缓账待裁）。
- 审计人 / 日期：人（FDE·AskUserQuestion）· 2026-10-17

### 4.1 执行期偏差留痕（实现事实回写·不改裁定目标）

1. **实机版本订正**：安装 `@nestjs/throttler@6.7.1`（非起草拟写的 v7.x；v6 为 Nest 12 兼容主线，API 与裁文一致：ttl 毫秒、`throttlers:[{ttl,limit}]`、默认 tracker=`normalizeIp(req.ip)` 源码坐实）。
2. **反代对拍手段换形**：§2 S2 拟「gated e2e 真 HTTP 打穿 429（含 XFF 头对拍）」→ 实际由 **DB-free 真 Nest+Fastify 行为测**承担（rate-limit.wall.test：超限 429/`@SkipThrottle` 不计数/两 XFF 真 IP 各自成桶——若未启 trustProxy 第三击必 429 的反证形），不开新 gated 文件（墙零 DB 依赖，真 app inject 已走完整 HTTP 链）；BA 面不受波及由 auth-http-surface.e2e 既有 4 测回归绿实证。守卫抛错路径事实：429 响应不写 X-Throttler 头（锁测改锁体 statusCode）。
3. **解析单源搬迁**：`parseTrustedProxies` 由 auth.implement 出至 `common/trusted-proxies.ts`（双链消费后属横切设施·modules→common 方向止倒挂），ip-trust 测 import 同步；CreateAuth 生产缺配 warn 文案扩为双链表述（仍一响不双噪）。
4. **类型窄化坑登记**：仓内存在两份 fastify 类型副本（5.12.5/5.12.7），`buildFastifyHttpOptions` 返回类型弃具名 `FastifyServerOptions`（跨副本 disableRequestLogging 不变异不协·tsc 真报错）改结构字面量 `{ logger: true; trustProxy?: string[] }`。
5. **Fastify 5 trustProxy 语义对拍结清（原未决项）**：源码 `lib/request.js` L43-62/L103-117 坐实——CIDR 字符串数组经 `@fastify/proxy-addr` compile 支持，`req.ip` = 可信链最右真客户端；plan §3 登记的「归因风险」解除。

## 5. 完成判据（可核验 + 穷尽）

- [x] Nest 路由面默认受限（deny-by-default·health 豁免实证：行为测 skip 不计数 + 元数据在场）
- [x] 限流 key 的 IP 解析与 BA 信任链同源（`AUTH_TRUSTED_PROXIES` 单源·parse 出至 common/trusted-proxies·XFF 双桶对拍锁测）
- [x] 执行序锁测：限流 → 401 会话墙 → 403 租户墙（AppModule imports 元数据序锁）
- [x] BA wildcard 面不受波及（auth-http-surface.e2e 真库回归 4/4 绿）
- [x] `pnpm run ci` 全绿·基线只增不减（416/30 → **426/30**·+10）
- [x] plan/README 状态落登记（architecture 限流条款属 specs 修宪·丁裁未涵盖→不随本片动，待另签）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 起草（借鉴评估唯一净缺口立项） | 首版·待审计门 |
| 2026-10-17 | 0.2.0 | 审计门四裁落案 | 甲 throttler 全局墙/乙 AUTH_TRUSTED_PROXIES 同源/丙 300 次/60s 宽档（昂贵面收紧转缓账）/丁高危随片签（specs 修宪不在范围） |
| 2026-10-17 | 0.3.0 | S1–S2 交付 | §4.1 偏差留痕五条（版本订正 6.7.1/对拍换形 DB-free/解析单源搬迁/类型窄化坑/trustProxy 语义结清）；DoD 六条全打钩 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.3.0 变更，以当前正文内容为准。
