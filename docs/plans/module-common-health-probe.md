# 技术方案 · 存活探针端点（health probe · 修 Docker HEALTHCHECK 断头路）

> 状态: **已验收·结项**（人批准 2026-10-14·甲乙丙丁照建议·commit `e958add`·人验收 2026-10-14·CI **297/13** 新基线）| 读者: **Agent**（开发依据）
> blast radius: **app 级小片**（新增 `common/health` 一个模块 + 修正 auth 旁路表一条 + 一个依赖 `@nestjs/terminus`·**零 schema 变更不触 migrate**·不接新守卫）
> 缘起: 评价 softkit-nestjs-boilerplate 时的**正向借鉴 #1**（其 `@nestjs/terminus` 范式）；本仓对应位置是**已存在的真实缺陷**而非功能缺口。另呼应 [nestjs-fastify-nx-review](../research/nestjs-fastify-nx-review.md) 借鉴 checklist 中「health probe 分层」挂账。

## 1. 背景与问题（取证坐实）

- [Dockerfile#L35](../../Dockerfile) `HEALTHCHECK` 探测 `http://localhost:7009/api/v1/health`，[docs/docker-deployment.md](../docker-deployment.md) 「Checking Container Health」向用户承诺了该机制。
- 但全 `apps/api/src` **没有任何 health 路由实现**（无 controller、无 terminus 依赖）——容器上线后 `wget --spider` 对 404 退非零码，`docker ps` 恒显 *unhealthy*，K8s liveness/运维探活不可用。**部署文档的承诺面与代码脱节。**
- 三处路径口径互不一致：Dockerfile 探 `/api/v1/health`；[auth.constant.ts#L29](../../apps/api/src/modules/auth/auth.constant.ts) 旁路表写 `/healthcheck`；代码零实现。
- 现网语义核对：`main.ts` 全局前缀 `api` + URI 版本化 default `1` → `@Controller('health')` 恰好落在 `/api/v1/health`，与 Dockerfile 声明吻合（无需动 Dockerfile）。

## 2. 目标与非目标

**目标**
1. `GET /api/v1/health` 存活探针真实存在并返回 200（liveness 语义：仅进程活着，不做依赖检查）。
2. 引入 `@nestjs/terminus`（npmmirror 已有 Nest 12 兼容版 **12.1.0**）作标准实现，非手搓重复语义。
3. 旁路三角色全部对齐到 `/health`：auth middleware 旁路表（`AUTH_BYPASS_PATHS` 陈旧项 `/healthcheck` → `/health`）、会话读取器廉价路径（复用同表自动对齐）、全局双墙豁免（`@Public()` 一条即同时旁路会话墙与租户墙——高危#4 收口时已定「@Public 蕴含无会话=无租户」）。
4. 默认 CI（DB-free）不受扰动：boot 冒烟 compile 整树即覆盖新模块 DI 可解析。

**非目标**
- ❌ DB/Redis readiness 端点（`/health/ready` 分层）——本片只做 liveness，留 §6-丁 与后续登记。
- ❌ 改 Dockerfile / docker-compose（Dockerfile 声明即本次对齐的 SSOT 锚点）。
- ❌ 响应体泄版本/uptime/依赖状态（公网暴露面指纹最小化）。
- ❌ 新表/新列/迁移/新守卫。

## 3. 设计（决策完备）

### 3.1 模块形态

```
apps/api/src/common/health/
├── health.module.ts    # imports: [TerminusModule]，controllers: [HealthController]
└── health.controller.ts
```

- `@Public()`（双墙豁免）+ `@Controller('health')` + `@Get()`，`@HealthCheck()` 装饰器 + ~~`indicators: () => [PingHealthIndicator]`~~ **实现期订正：`health.check([])` 空指示器数组**（terminus 12.1.0 已移除 PingHealthIndicator，见 §8 v0.3）——响应 `{ status: 'ok', info:{}, error:{}, details:{} }`，**无版本/uptime/环境信息**。
- `AppModule` imports 追加 `HealthModule`。
- `bun add @nestjs/terminus@^12.1.0`（npmmirror registry·工具红线合规）。

### 3.2 旁路对齐

- `AUTH_BYPASS_PATHS` 中 `'/healthcheck'` → `'/health'`（auth middleware 与 auth-session.reader 共用此表，一处改两处生效；`includes` 语义下 `/health` 命中 `/api/v1/health` ✓）。

### 3.3 测试面（DB-free）

1. **Controller 元数据回归测**（既有规范）：`@Public` key 在 handler 上可读回；路径元数据 = `health`。
2. **单测**：`HealthController` 手工实例化（注入 mock `HealthCheckService`）→ execute 返回 `{ status: 'ok' }` 形态；断言响应**不含** version/uptime 类指纹字段。
3. **boot 冒烟**：现有 compile 整树测自动覆盖（terminus provider 树可解析·免连库）。
4. gated e2e **不需要**（无外部依赖语义，CI 294/13 基线不动，预计 +2~3 passed）。

## 4. DoD

- [x] `/api/v1/health` 返回 200 + `{status:'ok'}`（单测/元数据测坐实；实机 curl 佐证：**200**，体经全局 TransformInterceptor 包裹为 `{data:{status:'ok',info:{},error:{},details:{}},statusCode:200,message:'Success'}`——Docker `wget --spider` 只看状态码，不破探针语义）。
- [x] 旁路表口径统一（`/health`），`/healthcheck` 陈旧字样全仓清零（p1b 测试夹具同步改真实路径 `/api/v1/health`）。
- [x] boot 冒烟绿·CI 全绿且新基线入账（**297 passed/13 skipped**·TSC 0·Biome 0 修复）。
- [x] docs/docker-deployment.md 健康检查小节与实况一致（`docker inspect` 叙述自本片起才真实成立·演变记录记「承诺面兑现」）。
- [x] plans/README 本行结项式更新（已随验收翻「已验收·结项」）。

## 5. 里程碑对照（P1 端口倒置等）

不触 domain/port 面；纯入口层设施，无倒置冲突。

## 6. 未决事项（待人裁·附建议）

- **甲 · 依赖选择**：引入 `@nestjs/terminus` vs 零依赖手搓一个返回 200 的 controller？——**建议引入 terminus**。理由：这是 softkit 已验证的正向借鉴点；liveness/readiness 语义标准化，后续加 DB 探针是配置不是重写；npmmirror 已有 Nest 12 兼容版（12.1.0）；手搓会重复实现且演进时二次抛弃。成本：+1 运行时依赖。
- **乙 · 路径锚点**：以 Dockerfile 的 `/api/v1/health` 为 SSOT 改代码侧，还是反向改 Dockerfile 迁就 `/healthcheck`？——**建议前者**。Dockerfile 路径已写进部署文档承诺面，且与全局前缀+版本化天然吻合；`/healthcheck` 只活在旁路表里无任何实现，是死字样。
- **丙 · 响应面**：ping-only（无 uptime/version/环境指纹）？——**建议 ping-only**。探针端点必然免认证暴露，模板项目公网示例不应泄漏应用指纹；信息型健康端点若将来需要走 readiness 分层（丁）。
- **丁 · readiness（DB 探针）**：本切片是否顺带 `/health/ready`（Drizzle ping）？——**建议不做**。保 CI DB-free 不变量干净；Docker HEALTHCHECK 只需 liveness；readiness 属编排层需求（K8s 场景），出现真实需求再立项。

## 7. 风险与回退

- 新端点为纯增量：回退 = revert 两文件目录 + 旁路表一行 + 依赖移除，净退。
- `includes('/health')` 子串匹配的宽松性为**既有机制**（非本片引入），新路径前缀 `/api/v1/` 下无碰撞面（全路由表核对无其它含 `health` 的路径）；机制收紧不在本片特判，留观察。
- terminus 与 Nest 12 兼容性以 12.1.0 版本对（npmmirror 实查），非猜测。

## 8. 演变记录

- 2026-10-14 v0.1: 立项起草。取证链：Dockerfile L35 探针声明 / auth.constant 陈旧 `/healthcheck` / 全 src 无实现 / research checklist「health probe 分层」呼应 / terminus 12.1.0 兼容版实查。§6 甲乙丙丁待裁。
- 2026-10-14 v0.2: 人「同意」过门——甲乙丙丁照建议（含借鉴清单其余两项处置：#2 分页契约不混装、#3 分类学观察项随片挂账 global-tenancy）。
- 2026-10-14 v0.3: 实现期三项如实登记：① **terminus 12.1.0 已移除 `PingHealthIndicator`**（plan 假设安装面失效，装后实查 dist 坐实）——liveness 等价实现改 `health.check([])` 空指示器数组，标准机器/响应形状/后续扩展性全保留，甲丙裁决语义不破；② `@Get()` 无参的 handler PATH 元数据实为 `'/'` 非 `''`（元数据测据实钉住）；`RequestMethod` 自 `@nestjs/common` 根导出（`RequestEnum` 非公共面）。③ 响应体经全局 TransformInterceptor 包裹（探针语义只看 200 状态码，事实登记不改机制）。实机 curl 佐证 200（dev 直跑真库）；单测 +3（元数据×2 + ping-only 指纹断言），p1b 夹具同步换新路径。
- 2026-10-14 v0.4: 人「同意」验收 → **结项**（commit `e958add`·CI 新基线 **297/13**）。Dockerfile HEALTHCHECK 承诺面自声明以来首次接通；research checklist「health probe 分层」liveness 半兑现（readiness 丁裁缓行留登记）；借鉴 #3 分类学观察项已随片挂账 global-tenancy；借鉴 #2 分页契约留候选待裁。
