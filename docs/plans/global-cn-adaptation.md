# 中国大陆地域适配方案（Mainland-China Adaptation）

> 适用范围: `全局` ← blast radius，审计深度=人签核（`workflow.md` §3/§5）
> 关联: [vision.md](../specs/vision.md) §4.3 计费 / §6 地域与合规约束 · [global-tenancy.md](./global-tenancy.md) FR-8/D5（已回改为多通道 provider）· [architecture.md](../specs/architecture.md)（provider 落 infrastructure/瘦适配器层）· [tooling-standards.md](../specs/tooling-standards.md)（选型 SSOT，待落）· [research/better-auth-cn-providers.md](../research/better-auth-cn-providers.md)（参考·非依据）· [workflow.md](../specs/workflow.md) §1/§3
> 性质: **技术方案（plan）**，重写型 · 版本 0.3.0 · 日期 2026-10-13 · 状态: **已审·开发依据**（`workflow.md` §3 已过审计门，见 §12）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表
> 受众: **人（方案主导）+ Agent（已审后为开发依据）**

---

## 0. 文档定位

本文把 [vision.md](../specs/vision.md) §6「地域与合规约束」落为**需求**并给出**可执行技术方案**。§4 需求、§5 决策已定；§6 方案设计、§8 垂直切片映射、§9 影响面与迁移为本轮从 pre-plan 升级所补。处于主流程链「技术方案 →（审计门）→ 垂直切片实现」的**方案末端**——**尚未过审计门**。依 `workflow.md` 铁律「无已审方案不写码」，本文人签核审计前，**不得开工**（含低风险项）。

## 1. 背景与问题

现模板偏海外：支付仅 Stripe、社交登录仅 Google/GitHub、依赖走默认源、日志用 Datadog transport。面向大陆则：**Stripe 无大陆商户主体**、**海外 OAuth 境内不可用**、**npm / Docker Hub 拉取受限**、**Datadog 不便**。要把这些替换 / 扩展为境内可用方案，同时保持**可插拔**（不因适配牺牲核心切片的通用性）。

核心难点：① 支付/登录多 provider 并存且接口统一（不污染核心）；② 微信 / 企业微信 / 钉钉 / 飞书 各自鉴权模型差异大，Better Auth 无内置、须 `genericOAuth` 自定义；③ 支付宝周期扣款 / 微信委托代扣有**资质门槛**；④ 合规（PIPL / 数据驻留 / ICP）与代码/部署边界如何划分。

## 2. 目标 / 非目标

**目标**
- 支付抽象为 **provider 接口**，三通道并存：Stripe（海外）+ 微信支付 + 支付宝（大陆）。
- 登录在保留 Google/GitHub 之外，**新增境内 provider**：微信、企业微信、钉钉、飞书。
- 依赖镜像境内化：`bun install` / Docker 基础镜像走国内源。
- i18n **默认中文**；文档以中文为准。
- 日志 / 监控后端去 Datadog，输出默认落文件。
- 明确 **PIPL / 数据驻留 / ICP** 的落点（代码 vs 部署）。

**非目标**
- **不做手机验证码登录**（已裁决，见 D3）；
- 不扩海外其它支付（PayPal 等）；Stripe 仅保留、不主导大陆；
- 本 plan 不代办第三方**密钥申请 / 商务资质**（属运营前置）；
- 不新增语言（沿用 en/zh/ja，仅改默认）；
- 本期不引入**集中日志监控**（SLS / Loki）。

## 3. 领域词汇（地域适配相关）

| 词 | 含义 |
|----|------|
| **PaymentProvider（支付通道）** | 统一支付接口；实现 = `StripeProvider` / `WechatPayProvider` / `AlipayProvider`。与 storage provider 同构，落 infrastructure 层 |
| **AuthIdentityProvider（登录渠道）** | 社交 / 企业身份登录渠道；`Google/GitHub`（保留）+ `Wechat`(开放平台/公众号) / `Wecom`(企业微信) / `DingTalk`(钉钉) / `Feishu`(飞书)，经 Better Auth `genericOAuth` |
| **accountSubject** | 渠道侧用户唯一标识（unionid / corpid+userid / 钉钉 unionId / 飞书 open_id），落 `account.accountId` 关联到 email user |
| **周期扣款 / 委托代扣** | 支付宝「周期扣款协议」、微信「委托代扣」——签约后自动续费，**需商户资质**；对应订阅制 |
| **数据驻留（Data Residency）** | 个人/业务数据存于境内 region（部署 + DB/存储 region 选项，配置层强约束） |
| **PIPL** | 《个人信息保护法》：告知-同意、最小必要、按自然人 user 查阅/导出/删除 |
| **ICP 备案** | 境内域名 / 对外服务的行政前置，属**部署**范畴、非代码门禁 |

## 4. 需求

### 4.1 功能需求（FR）

- **FR-1 支付 provider 抽象**：定义统一 `PaymentProvider` 接口（创建客户 / 订阅 / 收款 / 回调验签 / 退款），三实现 **Stripe（海外）+ 微信支付 + 支付宝（大陆）**；租户订阅与配额挂钩（接 global-tenancy FR-7/FR-8）经该接口，不绑定单一通道。
- **FR-2 周期扣款（订阅续费）**：大陆订阅续费经**支付宝周期扣款 / 微信委托代扣**实现；能力与资质随通道差异，**方案层细化**（本 plan 仅立需求与接口位，落地依资质到位；未具备时以「预付费时长 + 手动续费」过渡）。
- **FR-3 境内登录 provider（邮箱为体、社交为用 · 方案 C）**：以 Better Auth `genericOAuth` 接入 微信、企业微信、钉钉、飞书（保留 Google/GitHub）。**平台账号主体仍是 email+密码的全局唯一 user**；社交渠道**不独立建号**，而是作为**既有 user 的登录 / 绑定方式**——因多数境内渠道不返 email，新渠道首登须经「先以 email 账号登录再绑定该社交」或「社交首登后关联既有 email 账号」完成归属；各渠道以 `accountSubject`(unionid/corpid+userid…) 落一条 `account` 关联到同一 user。跨渠道身份由「都绑到同一 email user」自然统一，无需按厂商键自动合并。不与租户维度耦合（接 global-tenancy D3/FR-3，**email 唯一语义保持不变**）。
- **FR-4 依赖镜像境内化**：`bunfig.toml` / `.npmrc` 配 **npmmirror** registry；`Dockerfile` 基础镜像与构建期拉取改用**国内镜像 / 镜像仓库**；相关文档同步。
- **FR-5 默认语言中文**：i18n fallback / 默认 locale 置 `zh`；校验消息、邮件模板以中文为默认准。
- **FR-6 日志后端**：移除 `pino-datadog-transport`；pino 输出**默认落文件**（本地 / 滚动），**本期不引入集中监控**（SLS / Loki 不做，留后）。
- **FR-7 合规落点**：① **PIPL** 注册/授权告知-同意（consent 留痕）+ **按自然人 user** 的数据查阅/导出/删除接口（区别于 global-tenancy NFR-6 的按租户）+ 最小必要字段；② **数据驻留强制境内**：DB / OSS / 日志默认境内 region、不可出境（配置层约束）；③ **ICP 备案**归部署文档前置、不作代码门禁；法务/流程（DPO、出境评估、泄露应急、未成年人监护同意）本 plan 不代办。

### 4.2 非功能需求（NFR）

- **NFR-1 可插拔**：新增 / 停用某支付或登录通道**不改核心切片**（对齐存储 provider 抽象与 architecture.md 分层）。
- **NFR-2 未配即降级**：未提供某境内通道凭证时，应用可正常启动、该通道不可用（feature 关闭），不硬依赖、不崩溃。
- **NFR-3 密钥安全**：第三方密钥 / 证书仅经环境变量 / 密管注入，不入库、不入仓、不进日志。
- **NFR-4 可测试**：provider 以契约 / 单元测试覆盖，**不依赖真实第三方沙箱**（可 mock）；越权 / 回调验签有回归。
- **NFR-5 文档以中文为准**：面向大陆的文档中文优先（呼应既有「README 文档中文及真实性规范」）。

## 5. 关键设计决策（**gate**）

> 未定项前，本需求**不得进入实现**。D1–D7 已由人裁决。

| # | 决策 | 状态 | 结论 / 倾向 |
|---|------|------|------------|
| **D1** ✅ | **支付通道** | 已裁决 | **三通道并存**：Stripe（海外）+ 微信支付 + 支付宝（大陆），统一 provider 抽象（与存储同构）；据 FR-1 已回改 global-tenancy FR-8 / D5 |
| **D2** ✅ | **登录渠道** | 已裁决 | 保留 Google/GitHub（例外不受约束）+ **新增 微信、企业微信、钉钉、飞书**；Better Auth `genericOAuth` |
| **D3** ✅ | **手机验证码登录** | 已裁决 | **不做**；实名走平台人工审批（global-tenancy CL-2），**无需短信服务商** |
| **D4** ✅ | **依赖镜像 / 默认语言** | 已裁决 | npmmirror + Docker 国内基础镜像；i18n 默认 `zh`（低风险，实现期确认具体源） |
| **D5** ✅ | **对象存储默认通道** | 已裁决 | 默认 **阿里云 OSS**（已有专用 provider、生态最成熟）；COS / S3 作可选通道，经环境变量切换 |
| **D6** ✅ | **日志 / 监控后端** | 已裁决 | **移除 Datadog**；日志落 **文件（默认，pino transport）**，**不引入集中监控**（SLS / Loki 本期不做） |
| **D7** ✅ | **合规落点边界** | 已裁决 | **ICP**=部署/运营前置、**不进代码门禁**（归部署文档）；**数据驻留=强制境内**（DB/存储/日志默认境内 region、不可出境）；**PIPL=代码基线**（注册告知-同意 + **按 user** 导出/删除 + 最小必要），法务/流程不代办 |

## 6. 方案设计

> 落点均遵 architecture.md：`auth` / `stripe` / `storage` 现为**瘦适配器**，本方案沿用 storage 的 provider 工厂同构，DDD/ES 化按既有节奏递延，不强推。

### 6.1 支付 provider 抽象（FR-1 / FR-2）

新增上下文 `src/modules/payment`（provider 工厂式，与 `src/modules/storage` 同构）：

```
src/modules/payment/
├── providers/
│   ├── payment.interface.ts      # PaymentProvider 端口
│   ├── stripe-payment.provider.ts    # 由现有 src/modules/stripe 收敛而来
│   ├── alipay-payment.provider.ts    # 支付宝（含周期扣款 capability 桩）
│   └── wechatpay-payment.provider.ts # 微信支付（含委托代扣 capability 桩）
├── services/payment.service.ts   # 按 config + 租户通道选择 provider
├── controllers/payment.controller.ts
└── payment.module.ts             # register(): PAYMENT_PROVIDERS 工厂
```

`PaymentProvider` 端口（签名草案，审计后定稿）：

```ts
export type PaymentProviderId = 'stripe' | 'alipay' | 'wechat_pay';
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  supportsRecurring(): boolean;                 // 周期扣款能力探测
  createCustomer(input: CustomerInput): Promise<CustomerRef>;
  createCheckout(input: CheckoutInput): Promise<CheckoutRef>; // 下单 / 支付意图
  verifyWebhook(raw: unknown): Promise<NormalizedPaymentEvent>; // 回调验签归一化
  refund(input: RefundInput): Promise<RefundRef>;
  signDeductionContract?(input: ContractInput): Promise<ContractRef>; // 仅周期扣款通道
}
```

装配（`PaymentModule.register()`，仿 `StorageModule.register()`）：**默认注册 `stripe`**（配了密钥才启用），据 `payment.provider` / 租户地域追加 `alipay` / `wechat_pay`；未配凭证的通道**不注册**（NFR-2 未配即降级，取用抛明确错、应用照常启动）。密钥全走 env（NFR-3）。

**FR-2 周期扣款**：能力随通道差异，`supportsRecurring()` 为门；**资质未具备前**以「预付费时长 + 手动续费」过渡（§11-1），签约接口留 `signDeductionContract?` 桩、不阻塞主链。global-tenancy FR-8/D5 已回改为多通道，与本节一致。

### 6.2 境内登录 provider（FR-3 · 方案 C · genericOAuth）

配置层新增 `auth.genericOAuth: GenericOAuthConfig[]`（`src/config/envs`），每渠道一项：

```ts
interface GenericOAuthConfig {
  providerId: 'wechat' | 'wecom' | 'dingtalk' | 'feishu';
  enabled: boolean;
  clientId: string; clientSecret: string;
  authorizationUrl: string; tokenUrl: string; userInfoUrl: string;
  // 各渠道差异经钩子吸收：scope / 参数 / profile 映射 / 服务端代理
}
```

`CreateAuth`（`src/modules/auth/auth.implement.ts`）按 `enabled` 拼装 `genericOAuth({ config })`，Google/GitHub 仍走 `socialProviders`（保留）。要点：

- **email 为体**：`accountLinking` 对境内渠道**关闭自动建号**；user 主键仍 email 全局唯一（`user.email notNull + unique` 现成，**不改**）。
- **社交为用**：`accountSubject`（unionid / corpid+userid / 钉钉 unionId / 飞书 open_id）落 `account.accountId`、`account.providerId` 标渠道——**复用现有 `account` 表，无需 schema 变更**。
- **绑定 / 关联流**：① 已登录 email user → 发起渠道 OAuth → 回调把该 account 关联到当前 `userId`；② 渠道首登且 `accountSubject` 无匹配 → **不建号**，引导「以 email 登录 / 注册后关联」。跨渠道因归到同一 email user 而天然统一。
- **customFetch**：企业微信 / 钉钉的 token/userinfo 端点差异与 CORS 限制，经服务端 `customFetch` 代理吸收。
- **分期**（依 [research](../research/better-auth-cn-providers.md) 难度，非依据）：飞书(低–中) → 微信 / 钉钉(中) → 企业微信(高)，逐渠道独立切片交付。

### 6.3 依赖镜像境内化（FR-4）

`bunfig.toml` `[install] registry = "https://registry.npmmirror.com"`（或 `.npmrc`）；`Dockerfile` 基础镜像与构建期拉取改国内镜像仓库；`install&run.md` / `docker-deployment.md` 同步可选源说明。**无 schema、纯配置，最低风险。**

### 6.4 i18n 默认中文（FR-5）

i18n 装配处（`src/i18n`，实现时定位 fallback）默认 / fallback locale 置 `zh`；校验消息、邮件模板中文为准。仅改默认、不删 en/ja。

### 6.5 日志去 Datadog（FR-6 / D6）

`src/logger/logger.service.ts` 移除 `pino-datadog-transport` target → **dev** `pino-pretty`(console)、**prod** `pino/file`(可 `pino-roll` 滚动)；移除 `config.getDatadogConfig` 与 `default.ts` 的 `datadog` 块、`package.json` 依赖、`.env.example` 的 `DATADOG_*`。本期不接集中监控。

### 6.6 PIPL 代码基线（FR-7）

- **告知-同意**：新增 `consent` 记录（user 维度，type/scope/version/timestamp），注册与关键授权处留痕（expand 新表、可空、向后兼容）。
- **按自然人 user 的查阅 / 导出 / 删除**：`GET /users/me/data-export`（聚合个人数据 JSON）、`DELETE /users/me`（删除 / 匿名化）——**属 user 级**，区别于 global-tenancy NFR-6 的**按租户**导出/删除（两边互补，已交叉引用）。
- **最小必要**：注册字段裁剪。
- **数据驻留强制境内**：启动期对 DB / OSS / 日志 region 做**境内 allowlist 校验**（配置层，越界拒启或告警）；**ICP** 归部署文档、不进代码门禁。

## 7. 优先级（MoSCoW）

- **Must**：FR-1 支付抽象、FR-3 境内登录、FR-4 镜像、FR-5 默认 zh + NFR-1/2/3/4。
- **Should**：FR-6 日志替换、D5 存储默认、FR-7 合规代码侧（同意 / 导出删除复用）。
- **Could**：FR-2 周期扣款（依资质）。
- **Won't**：手机验证码登录、海外其它支付、第三方密钥/资质代办、**集中日志监控（SLS/Loki，本期）**。

## 8. 垂直切片映射（Must/Should → 可独立交付单元）

| 切片 | 需求 | 主要落点（文件/上下文） | schema 迁移 | 依赖 |
|------|------|------------------------|------------|------|
| **P1** 支付抽象 + Stripe 收敛 | FR-1 / NFR-1/2/4 | `src/modules/payment/{providers, services, payment.module}`、`config/envs/payment` | 无（沿用现有订阅映射） | — |
| **P2** 支付宝通道 | FR-1 / FR-2 | `alipay-payment.provider.ts` + env | 无 | P1；资质门（周期扣款桩） |
| **P3** 微信支付通道 | FR-1 / FR-2 | `wechatpay-payment.provider.ts` + env | 无 | P1；资质门 |
| **A1** 飞书登录 | FR-3 | `auth.genericOAuth` feishu + 绑定流 | 无（复用 `account`） | — |
| **A2** 微信 / 钉钉登录 | FR-3 | genericOAuth wechat/dingtalk + 绑定流 | 无 | A1 |
| **A3** 企业微信登录 | FR-3 | genericOAuth wecom + `customFetch` | 无 | A2 |
| **M1** 依赖镜像 | FR-4 | `bunfig.toml`/`.npmrc`、`Dockerfile`、文档 | 无 | 最低风险，可先行 |
| **L1** 默认 zh | FR-5 | i18n fallback、校验/邮件默认 | 无 | 可先行 |
| **G1** 去 Datadog | FR-6 / D6 | `logger.service.ts`、`config/envs`、`package.json`、`.env.example` | 无 | 移除即契约变更（观测） |
| **C1** PIPL 同意+导出/删除 | FR-7 | `consent` 表、`users` me 端点 | **有（expand）** | users 上下文 |
| **C2** 数据驻留校验 | FR-7 / D7 | config 启动期 region allowlist | 无 | C1 |
| **S1** 存储默认 OSS | D5 | `storage` provider 默认 env | 无 | — |

> 每片须配**契约 / 单元测试**（provider 全 mock、验签回归，NFR-4），实现走 `workflow.md` 本地 CI L1 门禁。

## 9. 影响面与 expand–contract 迁移

**Blast radius：全局**（跨 config / auth / payment / logger / i18n）；审计深度=人签核。

采用 **expand–contract**，先扩后收，避免一次性断链：

- **Expand（向后兼容）**：新增 `payment` 上下文（与既有 `stripe` 并存）、`auth.genericOAuth` providers（与 `socialProviders` 并存）、`consent` 表（可空）、`/users/me/*` PIPL 端点。
- **Validate**：provider 契约测试、验签回归、越权测试；不依赖真实沙箱（NFR-4）。
- **Contract（收）**：调用方从 `stripe` 直连迁至 `payment` 路由后**收缩旧模块**；`logger` 移除 `pino-datadog-transport` 与 `datadog` config；i18n 默认翻 `zh`；`.env.example` 增支付/登录密钥占位、删 `DATADOG_*`。

**不可逆 / 高危点**（须 `workflow.md` §3 人签核，agent 不得自行写入真实凭证）：

1. `consent` 表新增与 `users` me 删除/匿名化语义（数据不可逆）；
2. 移除 Datadog → 既有观测链断裂（须确认文件日志落地方案）；
3. i18n 默认翻 `zh` → 影响现存 en 默认用户体验；
4. `stripe` 直连收敛为 `payment` → **公共 API / DI 形态变更**（architecture §4.3 陷阱）；
5. `.env` / `.env.example` 新增密钥、令牌、连接串（§3.5 敏感配置，占位不写真实值）；
6. `accountLinking` 关自动建号 → 改变社交登录注册行为，须回归。

**回滚**：M1/L1/G1 纯配置可即时回退；P*、A* 以 env feature 开关关闭新通道即降级；C1 schema 走 Drizzle 迁移 down 脚本。

## 10. 完成判据（可核验 + 穷尽）

- [x] D1–D7 全部裁决并回写本文；
- [x] 本文已升级为正式技术方案（补 §6 方案 / §8 切片映射 / §9 影响面与迁移）；
- [x] 回改 global-tenancy FR-8 / D5：Stripe 单挂 → 多通道 provider（已提交 `bc627a6`）；
- [x] 选型（支付 / 登录 / 镜像 / 日志 / 存储默认）落 [tooling-standards.md](../specs/tooling-standards.md) §2.1（技术栈 SSOT，标「已决策·待落地」）；
- [x] 每条 Must/Should FR/NFR 有「垂直切片」映射且无遗漏（§8，审计复核通过）；
- [ ] `PaymentProvider` / `GenericOAuthConfig` 接口签名经实现切片时代码评审定稿（非阻断 M1/L1/G1）；
- [x] expand–contract 迁移与回滚步骤经审计确认可执行；
- [x] **审计门通过 + 人签核**（见 §12），已可开工（低风险项 M1/L1/G1 先行）。
- [x] **M1**（npmmirror/Docker 镜像 ARG）、**G1**（去 Datadog、日志落文件）、**L1**（mailer 默认 zh）已落地并通过本地 CI（commit `9e27d63`）；L1 全量翻译待 I18n 接线（非本片）。

## 11. 未决问题（审计前须澄清或标注占位）

1. **周期扣款 / 委托代扣资质**（FR-2）是否已具备？未具备则先「预付费时长 + 手动续费」过渡，不阻塞 P2/P3 主链。
2. **绑定 / 关联流 UX**（§6.2）细化：渠道首登无匹配时的引导页与 `accountSubject` 归属交互（方案 C 已定原则，交互待定）。
3. **consent 粒度**（§6.6）：按「用途 × 版本」还是单条总同意；与 PIPL 告知文本的映射。
4. **企业微信 corpid+userid 与 unionid 归属**、钉钉/飞书主体键的具体取字段（依实现期官方文档核验，research 仅参考）。
5. `tooling-standards.md` 落表方式（新增支付/登录 provider 行 + 镜像源）。

## 12. 审计记录（`workflow.md` §3）

- **审计结论**：**通过**。方案可作开发依据；**低风险项 M1/L1/G1 先行开工**，支付（P*）/ 登录（A*）/ 合规（C*）按序推进。
- **审计人 / 日期**：FDE Team（人签核）· 2026-10-13。
- **高危项签核（§9 六点）**：**全部接受**，附缓解——
  1. `consent` 表 + user 级删除/匿名化（不可逆）→ 接受；走 Drizzle expand 迁移 + down 脚本回滚。
  2. 移除 Datadog → 既有观测链断裂 → 接受；日志改**文件**（prod pino/file、dev/pretty），本期不引集中监控。
  3. i18n 默认翻 `zh` → 影响现存 en 默认用户 → 接受；仅改默认入口语言，保留 en/ja（见 L1 注）。
  4. `stripe` 收敛为 `payment`（公共 API / DI 变更）→ 接受；expand–contract，先并存再收缩。
  5. `.env`/`.env.example` 新增密钥位 → 接受；**只写占位、agent 不得写真实凭证**（§3.5）。
  6. `accountLinking` 关自动建号 → 改变注册行为 → 接受；方案 C 绑定/关联流 + 回归测试。
- **未决项处置（§11）**：
  1. 支付/代扣**资质**未确认 → **先以「预付费时长 + 手动续费」过渡**，不阻塞 P1；周期扣款 capability 桩待资质到位启用（P2/P3）。
  2. **绑定 UX** → 定为渠道首登无匹配时**不自动建号**，引导「以 email 登录/注册后关联」；`accountSubject` 落 `account`。
  3. **consent 粒度** → 按「**用途 × 版本**」记录并支持撤回留痕（贴 PIPL 最小必要）。
  4. **渠道主体键** → 实现各 A* 切片时核验官方文档定字段（飞书 open_id / 钉钉 unionId / 企微 corpid+userid / 微信 unionid）；不阻塞 A1。
  5. `tooling-standards` 落表方式 → **已按 §2.1** 执行（commit `ecbdb87`），确认。

## 13. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-13 | 0.1.0 | 首版：把 vision §6 地域约束落为需求草案（讨论期决策 D1–D7 属同一初稿形成，不单列） | 背景/目标/词汇/FR(1–7)·NFR/决策 gate(D1–D7)/MoSCoW/完成判据/未决 |
| 2026-10-13 | 0.2.0 | 需求草案 → **正式技术方案**（D1–D7 已定后，人指示升级） | 新增 §6 方案设计（PaymentProvider 接口、genericOAuth 方案 C 绑定流、镜像/i18n/日志、PIPL 基线）、§8 垂直切片映射、§9 影响面与 expand–contract；§10 完成判据扩充；§11 未决细化；§12 审计记录占位；性质/版本/状态改写 |
| 2026-10-13 | 0.3.0 | **过审计门（人签核）**，开工低风险项 | §12 落审签结论：高危六点全接受附缓解、未决 1–5 按倾向处置；§10 判据勾选（切片映射/迁移/审计门）；索引置「已审计·进行中」；启动 M1（npmmirror）/L1（默认 zh）/G1（去 Datadog） |

---

<!-- 变更戳 -->
正文已于 2026-10-13 / v0.3.0 过审计门（人签核·§12）并开工 M1/L1/G1；v0.1.0 讨论期多次澄清属同一初稿形成，不单列演变。以当前正文内容为准。
