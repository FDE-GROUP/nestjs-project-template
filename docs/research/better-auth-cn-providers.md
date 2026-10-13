# Better Auth 承载境内登录渠道 · 可行性调研

> **用途: 调研参考（非开发依据）**（`workflow.md` §2 · `docs/research/`）
> 关联: [global-cn-adaptation.md](../plans/global-cn-adaptation.md) FR-3 / §8-2 / §8-3 · [global-tenancy.md](../plans/global-tenancy.md) D3/FR-3（email 全局唯一、受邀 email）· [vision.md](../specs/vision.md) §6 地域约束
> 日期: 2026-10-13 | 证据基线: Better Auth v1.7.x（本仓 `better-auth ^1.7.7`）官方文档 `plugins/generic-oauth`
> 本文只作制定 plan 的**参考**，结论须经人二次核验后方可写入方案（`workflow.md` §3）

---

## 0. 调研目的

回答 [global-cn-adaptation](../plans/global-cn-adaptation.md) §8-3：**FR-3 的境内登录（微信 / 企业微信 / 钉钉 / 飞书）应「自建 OAuth 引擎」还是「复用 Better Auth」？** 以及 §8-2 的多渠道账号归并是否可行。

## 1. 结论速览

**Better Auth 无需 fork、不必自建 OAuth 引擎**——其 `genericOAuth` 插件把任意 OAuth2/OIDC 渠道注册为一等 `signIn.social` 渠道，且**每个环节都可覆写**，足以容纳境内 provider 的非标准实现。差异只在**各渠道自定义钩子的工作量**。

| 渠道 | 标准化程度 | 定制难度 | 所需 `genericOAuth` 钩子 | 唯一标识（`accountSubject`） |
|------|-----------|---------|--------------------------|------------------------------|
| **微信**（开放平台网站应用 / 公众号） | 非标准：token 走 GET/查询参、错误返 `errcode`（HTTP 200）、userinfo 端点独立 | **中** | `getToken` + `getUserInfo` + `mapProfileToUser` + `accountSubject` | `unionid`（回退 `openid`） |
| **企业微信**（WeCom） | 最不标准：需**服务端 corpid+secret 先取 corp access_token**（≈2h 缓存），再以 code 换 userid，非按用户 access_token | **高** | `getToken`（内含 corp 凭证换取）+ `getUserInfo` + `accountSubject` | `corpid + userid` / `open_userid` |
| **钉钉** | 半标准：`POST /v1.0/oauth2/userAccessToken`（**JSON body、参数名非标准**）；userinfo 用自定义头 `x-acs-dingtalk-access-token` | **中** | `getToken`（POST JSON）+ `getUserInfo`（自定义头）+ `accountSubject` | `unionId` |
| **飞书 / Lark** | 较标准：授权码 + `authen/v2/oauth/token`（JSON）+ Bearer 取 user_info | **低–中** | 多为标准配置 + `mapProfileToUser` + `accountSubject` | `union_id` / `open_id` |

> 关键：`getToken`（非标准 token 交换，含 GET/自定义参/内部凭证编排）、`getUserInfo`（自定义 userinfo 获取，可读 `tokens.raw` 里 provider 专有字段）、`mapProfileToUser`（映射可变档案字段）、`accountSubject`（解析**非标准不可变标识**，如 unionid/account_id）、`pkce:false`、显式 `authorizationUrl/tokenUrl/userInfoUrl`（无 OIDC discovery 时）、`validateUserInfo`（准入校验）——文档明示均支持。

## 2. 能力依据（引 Better Auth 文档）

来源: <https://better-auth.com/docs/plugins/generic-oauth>（访问 2026-10-13）

- 「The Generic OAuth plugin lets you add **any OAuth 2.0 or OpenID Connect (OIDC) provider**… registered as **first-class social providers**, standard `signIn.social` flow」——境内渠道可按一等公民接入。
- 「**Every aspect of the OAuth flow can be overridden**」+ 覆写矩阵（`getToken` / `getUserInfo` / `mapProfileToUser` / `accountSubject` / `tokenEndpointAuth: {method:"custom"}` / `pkce:false`）。
- 「**accountSubject**… Resolves the **immutable user identifier**… Set this resolver when a provider uses another field, such as `account_id`」——正好对上 unionid / corpid+userid / 钉钉 unionId。
- 「For providers with **non-standard token endpoints that use GET requests or custom parameters**, provide a custom `getToken`」——对上微信。
- 「Providers configured with **explicit endpoints instead of `discoveryUrl`**…」——境内渠道大多无标准 discovery。

## 3. 主要风险 / 待决（须进 plan，非本文裁决）

1. **Email 缺失 vs 全局唯一假设**：微信/钉钉/飞书**通常不返回 email**。这与 [global-tenancy](../plans/global-tenancy.md) D3/FR-3「`users.email` 平台全局唯一 + 受邀以 email」**直接冲突**。→ 方案须决：email 转**可选**、首登后补绑；或 user 主键去 email 依赖。**这是本项目多租户身份模型的地域适配点，非 Better Auth 限制。**
2. **跨渠道身份合并**：Better Auth 每渠道落**一条 `account`**；无 email/手机（本期已排除手机登录）作纽带，则同一自然人经微信、钉钉登录**默认成两个 user**。合并需**显式绑定**机制。→ 与 §8-2 呼应，方案层设计。
3. **企业微信凭证编排**：corp access_token 服务端换取 + 缓存(≈2h) + 并发刷新，落在 `getToken` 内；须守 [cn-adaptation NFR-3](../plans/global-cn-adaptation.md)（密钥仅 env/密管注入、不进日志）。复杂度最高 → **宜单列评估或分期**（先 微信/钉钉/飞书，企业微信后置）。
4. **PKCE / state / nonce**：部分渠道不支持标准 PKCE（需 `pkce:false`）、`state` 语义差异；回调 URL 须含 `:providerId` 占位并与渠道后台登记一致。
5. **实名/合规**：境内开放平台多要求已认证主体 + 回调域名备案（呼应 cn-adaptation D7-a ICP），属运营前置、非代码。

## 4. 对 plan 的建议（候选，待人二判）

- **不自建 OAuth 引擎**；FR-3 的 `AuthProvider` 抽象**瘦身为**「每渠道一份 `genericOAuth` 配置 + 钩子函数」，与存储 provider 抽象同构、落 infrastructure 层（呼应 [architecture.md](../specs/architecture.md)）。
- 把 **email 可选化 + 跨渠道合并策略**列为方案级待决策（联动回改 global-tenancy D3/FR-3）。
- 落地**分期**：飞书→钉钉→微信（低→中）先行，企业微信（高）后置单评。
- 实现前**最小 spike 验证**：以 `genericOAuth` 配一个真实渠道（建议飞书，最标准）跑通 `signIn.social` + `accountSubject` 落 account，再横向铺开。

## 5. 证据与出处

- Better Auth · Generic OAuth 插件：<https://better-auth.com/docs/plugins/generic-oauth>（钩子/覆写矩阵，访问 2026-10-13）
- Better Auth · OAuth 概念（socialProviders / link / mapProfile）：<https://better-auth.com/docs/concepts/oauth>
- Better Auth · Other Social Providers（generic 覆盖任意 OAuth2/OIDC）：<https://better-auth.com/docs/authentication/other-social-providers>
- 各渠道端点/参数名（微信 sns、钉钉 v1.0、飞书 authen v2、企业微信 getuserinfo）以**官方开放平台文档为准**，实现时逐条核对（本文凭通用知识归纳，**未逐端点实机验证**）。

---

<!-- 变更戳 -->
正文已于 2026-10-13 起草（v0.1.0 · 调研参考稿），结论须人二次核验后写入 plan，本文不作开发依据。
