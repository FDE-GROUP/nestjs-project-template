# 技术方案 · 生产限流信任链（BA IP 信任配置 + 死配置清理）

> 状态: **已验收·结项**（v0.2 人审通过照建议甲+乙1+丙+丁+戊；v0.3 实现登记；v0.4 人验收 2026-10-14·commit `e46d2c7`）| 读者: **人**（存档）
> 缘起: brocoders 借鉴轮反照项 V1+V2（[external-borrowing-backlog](../research/external-borrowing-backlog.md)）·人裁立项（"同意，1"）。
> blast radius: **两个单文件小改 + config 契约三处**（`auth.implement.ts` 加 advanced 段・`envs/*.ts` 删 security・新增 1 个 env 变量・零 schema・零业务模块）

## 1. 背景与实锤（全部库源码取证·better-auth 1.7.7）

限流面真实形态（比 backlog 初稿判据更准，订正见 §4）：

1. **BA 限流默认开启**，敏感路径有强默认规则：`/sign-in* /sign-up* /change-password /change-email` = **3 次/10s 窗**；`/request-password-reset`、OTP 发送等 = 60s 窗（`dist/api/rate-limiter/index.mjs` L305-316）。
2. **限流 key = `getIP(req, options)|path`**，`getIP` 完全由 BA 自有信任体系决定（`@better-auth/core/dist/utils/ip.mjs` L203-218），**与 Fastify `trustProxy` 无关**：
   - 读 `advanced.ipAddress.ipAddressHeaders`（默认含 `x-forwarded-for` 等标准头）；
   - **未配 `trustedProxies` 时只信单值 XFF**（多跳链直接弃 = 防伪造的正确姿态）；配了 CIDR 列表则右起反向跳过可信代理取第一个非可信 IP（教科书算法）；
   - **development/test 环境兜底 LOCALHOST_IP（dev 无感）**；**production 拿不到 IP → key 落共享桶 `no-trusted-ip`** → 全体真实用户共用一个 3 次/10s 桶 = **整站登录误杀（可用性事故坐实，非暴破防护形同虚设的镜像问题）**，且 warn 只打一次。
3. 本仓 `auth.implement.ts` **无 `advanced` 段、无 `rateLimit` 段**（grep 实锤零）= 全默认裸奔，生产部署即踩 2-末。
4. V2：`config/envs/{default,development,production}.ts` 各有 `security: { helmet, rateLimit }` 段 + `config.service.getSecurityConfig()` + 契约测——**getter 无任何生产消费方**（helmet 实际在 main.ts 硬注册、rate-limit 插件未装）= Prisma 时代类型化死配置，名实不符。

## 2. 方案（裁决点）

### 甲 · IP 信任配置形态（核心）

`auth.implement.ts` 增 `advanced.ipAddress.trustedProxies`：**env 驱动**——新变量 `AUTH_TRUSTED_PROXIES`（逗号分隔 CIDR 列表，如 `172.16.0.0/12,127.0.0.1`），未配=不传（保持库安全默认）。Joi 契约进 envs schema + `types.ts` 同步。**不做**：`ipAddressHeaders` 自定义（默认头表够用）、`disableIpTracking`（等于关防护，否决留档）。

### 乙 · 生产缺配处置（三选一）

- 乙1（推荐）：**信任 warn 显性化**——`NODE_ENV=production` 且 `AUTH_TRUSTED_PROXIES` 未配时，`auth.implement` 装配处 `logger.warn` 一响（部署日志可见），不拦启动。理由：限流误杀可被运维快速定位，而 fail-loud 拒启动对"未必有反代"的直连部署过苛（data-residency 那种一票否决有 PIPL 法定依据，此处无）。
- 乙2：仿数据驻留 fail-closed 启动守卫（生产未配拒启动）。
- 乙3：不处置（仅靠库自身一次性 warn）。

### 丙 · rateLimit 数值段显性化

显式写 `rateLimit: { enabled: true }`（结构在场、**不调窗值**——默认 3/10s 对暴破是对的激进；NAT 共享出口误杀场景经证据（乙1 warn 实际响起）再单裁 customRules，不预调）。附注释指明语义。

### 丁 · V2 死配置处置

**删净** `security` 段：三 env 文件 + `config.service.getSecurityConfig()` + 类型 + 对应契约测两处（helmet 名实在 main.ts 硬注册、限流真值由 BA 承载——声明不产生行为即删，名实纪律）。若将来要 @fastify/rate-limit 全局面再另行立项（BA 覆盖 auth 面，暂无需求）。

### 戊 · 测试账（DoD）

1. 单测：`AUTH_TRUSTED_PROXIES` 解析（env→CIDR 数组透传进 config·空值不传）；
2. **库行为契约测**：直调 `getIP`（或其导出等价物）钉死四态——dev localhost / 单值 XFF 可信 / 多跳未配 trustedProxies 弃 / 配 CIDR 反向跳——防 BA 升级静默改语义（借鉴线"契约测锁库行为"先例）；
3. CI 绿 + 基线入账；
4. backlog 订正：V1 行"Fastify trustProxy/request.ip"表述按 §1-2 实锤改写（如实留痕不删行）；
5. `docs/docker-deployment.md` 补一行：反代部署须配 `AUTH_TRUSTED_PROXIES`。

## 3. 明确不做

- Fastify `trustProxy`：与 BA 限流 key 无关（§1-2 实锤）；其影响面仅日志/guard 的 request.ip 展示——低价值，出本片，如需另立项。
- 全局 @fastify/rate-limit、sessionCache（B6）、V3 改密踢会话（前端入场触发）——均不在本片。

## 4. 演变记录

- **v0.1（2026-10-14·初稿待审计 + 自纠）**：backlog 初稿归因"Fastify trustProxy 影响 BA 限流 key"不成立——实码勘定 BA 走自有 `advanced.ipAddress.*` header 解析，与 Fastify 无关；风险本体（生产无信任配置→共享桶误杀）坐实且更准，backlog V1 行按此订正留痕（戊-4）。裁决点：甲 env-CIDR 透传 / 乙1 warn 显性化 / 丙结构在场不调值 / 丁删净 security / 戊五项 DoD。
- **v0.2**：人审通过（"同意"），甲+乙1+丙+丁+戊照建议。
- **v0.3（实现登记，两处实施期订正 + 一条新观察）**：
  1. 甲微调：`AUTH_TRUSTED_PROXIES` 不入 `AuthConfig` 命名空间（envs 多文件覆盖合并机制有不确定性），改为 `CreateAuth` 内直读 env + 导出纯函数 `parseTrustedProxies`，Joi 契约照加——与甲目标（env-CIDR 透传）语义等价。
  2. 戊-2 降级：`@better-auth/core` 非直接依赖（deep import MODULE_NOT_FOUND 实锤），四态库算法契约测不可行——降为 parse 四态测 + `auth.options` 透传断言（库算法主防线=BA 上游测试，本仓锁"我们传了什么"），已如实记于测试文件头注。
  3. **新观察（出本片范围）**：实机验证发现 BA 挂载面 `POST /api/v1/better-auth/sign-up/email` 返 404（`GET /better-auth/session` 200=装配健康），而本仓 Nest 路由面（controller `/better-auth`）无该 POST 路由——疑 BA 处理器在 Fastify 适配下的路由匹配/`emailAndPassword.enabled` 生产关闭交互有先存缝隙；**与本片 diff 无关**（未碰 handler/挂载面）——"建号正道 HTTP 面可用性"待下一独立切片核。
  4. 实现落地：`auth.implement.ts`（parse+warn+advanced+rateLimit 段）、`config.module.ts`（Joi）、三 env 删 security、interface/getter/测试删净、`auth.ip-trust.test.ts`（+5 测）、`.env.example`、docker-deployment.md、backlog V1/V2 订正。**CI 328/13（基线 323+5）**；实机 session 200（后经 [module-auth-http-surface](./module-auth-http-surface.md) §1-2 核正：系 stub 假信号，非 BA 装配健康证据）。
  5. 实现期失误留痕：development.ts 首次替换方向写反造成重复 security 块，当场订正净删（无残留，Biome/tsc 双验过）。
