# 中国大陆地域适配需求（Mainland-China Adaptation）

> 适用范围: `全局` ← blast radius，审计深度=人签核（`workflow.md` §3/§5）
> 关联: [vision.md](../specs/vision.md) §4.3 计费 / §6 地域与合规约束 · [global-tenancy.md](./global-tenancy.md) FR-8/D5（计费挂钩，需据本 plan 改为多通道）· [architecture.md](../specs/architecture.md)（provider 落 infrastructure 层）· [tooling-standards.md](../specs/tooling-standards.md)（选型 SSOT，待落）· [workflow.md](../specs/workflow.md) §1/§3
> 性质: **需求草案（pre-plan）**，重写型 · 版本 0.1.0 · 日期 2026-10-13 · 状态: **核心选型 D1–D3 已落定**（见 §5），D4–D7 部分待定；待升级为技术方案 + 过审计门（`workflow.md` §3）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

---

## 0. 文档定位

本文把 [vision.md](../specs/vision.md) §6「地域与合规约束」落为**可执行需求**：项目面向**中国大陆**用户，技术栈与第三方资源须**境内可访问、合规可用**。处于主流程链「确定设计目标 →（调研）→ 技术方案」前段——**尚非技术方案**。§5 决策齐后，在本文之下扩写「方案 / 垂直切片」章，升级为正式 plan 并过审计门。

## 1. 背景与问题

现模板偏海外：支付仅 Stripe、社交登录仅 Google/GitHub、依赖走默认源、日志用 Datadog transport。面向大陆则：**Stripe 无大陆商户主体**、**海外 OAuth 境内不可用**、**npm / Docker Hub 拉取受限**、**Datadog 不便**。要把这些替换 / 扩展为境内可用方案，同时保持**可插拔**（不因适配牺牲核心切片的通用性）。

核心难点：① 支付/登录多 provider 并存且接口统一（不污染核心）；② 微信 / 企业微信 / 钉钉 / 飞书 各自鉴权模型差异大，Better Auth 无内置、须自定义 provider；③ 支付宝周期扣款 / 微信委托代扣有**资质门槛**；④ 合规（PIPL / 数据驻留 / ICP）与代码/部署边界如何划分。

## 2. 目标 / 非目标

**目标**
- 支付抽象为 **provider 接口**，三通道并存：Stripe（海外）+ 微信支付 + 支付宝（大陆）。
- 登录在保留 Google/GitHub 之外，**新增境内 provider**：微信、企业微信、钉钉、飞书。
- 依赖镜像境内化：`bun install` / Docker 基础镜像走国内源。
- i18n **默认中文**；文档以中文为准。
- 日志 / 监控后端去 Datadog，可配境内或自建方案。
- 明确 **PIPL / 数据驻留 / ICP** 的落点（代码 vs 部署）。

**非目标**
- **不做手机验证码登录**（已裁决，见 D3）；
- 不扩海外其它支付（PayPal 等）；Stripe 仅保留、不主导大陆；
- 本 plan 不代办第三方**密钥申请 / 商务资质**（属运营前置）；
- 不新增语言（沿用 en/zh/ja，仅改默认）。

## 3. 领域词汇（地域适配相关）

| 词 | 含义 |
|----|------|
| **PaymentProvider（支付通道）** | 统一支付接口；实现 = `StripeProvider` / `WechatPayProvider` / `AlipayProvider`。与 storage provider 同构，落 infrastructure 层 |
| **AuthIdentityProvider（登录渠道）** | 社交 / 企业身份登录渠道；`Google/GitHub`（保留）+ `Wechat`(开放平台/公众号) / `Wecom`(企业微信) / `DingTalk`(钉钉) / `Feishu`(飞书) |
| **周期扣款 / 委托代扣** | 支付宝「周期扣款协议」、微信「委托代扣」——签约后自动续费，**需商户资质**；对应订阅制 |
| **数据驻留（Data Residency）** | 个人/业务数据存于境内 region（部署 + DB/存储 region 选项） |
| **PIPL** | 《个人信息保护法》：告知-同意、最小必要、导出/删除（复用 global-tenancy NFR-6 按租户导出/删除） |
| **ICP 备案** | 境内域名 / 对外服务的行政前置，属**部署**范畴、非代码门禁 |

## 4. 需求

### 4.1 功能需求（FR）

- **FR-1 支付 provider 抽象**：定义统一 `PaymentProvider` 接口（创建客户 / 订阅 / 收款 / 回调 / 退款），三实现 **Stripe（海外）+ 微信支付 + 支付宝（大陆）**；租户订阅与配额挂钩（接 global-tenancy FR-7/FR-8）经该接口，不绑定单一通道。
- **FR-2 周期扣款（订阅续费）**：大陆订阅续费经**支付宝周期扣款 / 微信委托代扣**实现；能力与资质随通道差异，**方案层细化**（本 plan 仅立需求与接口位，落地依资质到位）。
- **FR-3 境内登录 provider**：以 **Better Auth 自定义 provider** 接入 微信（开放平台网站应用 / 公众号）、企业微信、钉钉、飞书；各渠道唯一标识（unionid / corpid+userid 等）归并到**平台全局 user**（接 global-tenancy D3 / FR-3），不与租户维度耦合。保留 Google / GitHub。
- **FR-4 依赖镜像境内化**：`bunfig.toml` / `.npmrc` 配 **npmmirror** registry；`Dockerfile` 基础镜像与构建期拉取改用**国内镜像 / 镜像仓库**；相关文档同步。
- **FR-5 默认语言中文**：i18n fallback / 默认 locale 置 `zh`；校验消息、邮件模板以中文为默认准。
- **FR-6 日志后端替换**：移除 `pino-datadog-transport` 硬依赖，pino transport **可配置**——默认 stdout / 文件，预留 **阿里云 SLS / Loki** 等境内或自建 sink（最终 sink 见 D6）。
- **FR-7 合规落点**：PIPL 告知-同意接入注册 / 授权流程；数据导出 / 删除以租户为单位（复用 global-tenancy NFR-6）；数据驻留体现为部署 region 选项；ICP 备案列为部署文档前置（非代码）。

### 4.2 非功能需求（NFR）

- **NFR-1 可插拔**：新增 / 停用某支付或登录通道**不改核心切片**（对齐存储 provider 抽象与 architecture.md 分层）。
- **NFR-2 未配即降级**：未提供某境内通道凭证时，应用可正常启动、该通道不可用（feature 关闭），不硬依赖、不崩溃。
- **NFR-3 密钥安全**：第三方密钥 / 证书仅经环境变量 / 密管注入，不入库、不入仓、不进日志。
- **NFR-4 可测试**：provider 以契约 / 单元测试覆盖，**不依赖真实第三方沙箱**（可 mock）；越权 / 回调验签有回归。
- **NFR-5 文档以中文为准**：面向大陆的文档中文优先（呼应既有「README 文档中文及真实性规范」）。

## 5. 关键设计决策（**gate**）

> 未定项前，本需求**不得进入技术方案实现**。

| # | 决策 | 状态 | 结论 / 倾向 |
|---|------|------|------------|
| **D1** ✅ | **支付通道** | 已裁决 | **三通道并存**：Stripe（海外）+ 微信支付 + 支付宝（大陆），统一 provider 抽象（与存储同构）；据 FR-1 回改 global-tenancy FR-8 / D5 |
| **D2** ✅ | **登录渠道** | 已裁决 | 保留 Google/GitHub（例外不受约束）+ **新增 微信、企业微信、钉钉、飞书**；Better Auth 自定义 provider |
| **D3** ✅ | **手机验证码登录** | 已裁决 | **不做**；实名走平台人工审批（global-tenancy CL-2），**无需短信服务商** |
| **D4** ✅ | **依赖镜像 / 默认语言** | 倾向采纳 | npmmirror + Docker 国内基础镜像；i18n 默认 `zh`（低风险，实现期确认具体源） |
| **D5** ⏳ | **对象存储默认通道** | 待定 | S3/OSS/COS 已具；大陆默认建议 **阿里云 OSS 或腾讯云 COS**（择一为默认，其余可选） |
| **D6** ⏳ | **日志 / 监控后端** | 待定 | 去 Datadog；候选 **文件（默认）/ 阿里云 SLS / Loki**（是否引入集中监控待决策） |
| **D7** ⏳ | **合规落点边界** | 待定 | 确认 ICP=部署前置、数据驻留=region 选项、PIPL=代码+流程；哪些进本 plan、哪些归部署文档 |

## 6. 优先级（MoSCoW）

- **Must**：D1–D4；FR-1 支付抽象、FR-3 境内登录、FR-4 镜像、FR-5 默认 zh + NFR-1/2/3/4。
- **Should**：FR-6 日志替换、D5 存储默认、FR-7 合规代码侧（同意 / 导出删除复用）。
- **Could**：FR-2 周期扣款（依资质）、D6 集中监控。
- **Won't**：手机验证码登录、海外其它支付、第三方密钥/资质代办。

## 7. 完成判据（草拟，可核验 + 穷尽）

- [x] D1–D4 已裁决并回写本文；
- [ ] D5–D7 定案；
- [ ] 选型（支付 / 登录 / 镜像 / 日志 / 存储默认）落 [tooling-standards.md](../specs/tooling-standards.md)（技术栈 SSOT）；
- [ ] 回改 [global-tenancy.md](./global-tenancy.md) FR-8 / D5：Stripe 单挂 → 多通道 provider；
- [ ] 每条 Must FR/NFR 有「未来方案垂直切片」映射（无遗漏）；
- [ ] 本文升级为正式 plan（补 §方案 / 切片 / 影响面），索引置「已审计」前不写码。

## 8. 未决问题（讨论中）

1. 微信支付 / 支付宝**周期扣款 / 委托代扣资质**是否已具备？决定 FR-2 能否落地及订阅续费形态（否则先「预付费时长 + 手动续费」过渡）。
2. 微信 / 企业微信 / 钉钉 / 飞书 各自账号体系如何归并到平台全局 user（unionid、corpid+userid、staffId）与 membership；同一自然人多渠道身份合并策略。
3. Better Auth 自定义 OAuth provider 的实现成本与边界（是否够用、是否需 plugin）——宜先 `docs/research/` 调研（非依据）。
4. 数据驻留是否要求**强制境内**（影响 DB / 存储 region 配置默认），或允许海外部署。
5. 集中日志/监控（D6）是否为本期所需，抑或先「结构化 stdout + 后续接 SLS」。

## 9. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-13 | 0.1.0 | 首版：把 vision §6 地域约束落为需求草案（讨论期决策 D1–D4 属同一初稿形成，不单列） | 背景/目标/词汇/FR(1–7)·NFR/决策 gate(D1–D7)/MoSCoW/完成判据/未决 |

---

<!-- 变更戳 -->
正文已于 2026-10-13 / v0.1.0 定稿（讨论期多次澄清属同一初稿形成，不单列演变），以当前正文内容为准。
