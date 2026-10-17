# 前端 F2 · 租户自助面：workspace / 成员 / 订阅 可见与操作 UI（呈审稿）

> 适用范围: `模块(apps/web · 前端自助面)` | 受众: 人（审计/裁点）
> 关联: `global-frontend-adoption` §2.2-F2 / §2.3①（总纲已批范围 + Playwright F2 重呈）· `module-frontend-api-client`（F1 typed 客户端·本片首消费者）· `specs/vision.md` §4 第 7 支柱「人的界面」· `specs/tooling-standards.md` §4.12 · `specs/architecture.md`（apps/web 落位）
> 性质: 首版（总纲 F2 分片落地稿，不改总纲已批措辞）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

总纲 §2.2 承诺 F2 =「workspace/成员/订阅 可见与操作 UI（vision 阶段 3 自助管理首段）」。本片是其呈审稿，亦是 **F1 `@saas/api-client` 的首个真实消费者**——把「后端有 API 无 UI」的租户自助面（vision §3「用量与账单可见」）以前端形态落地。

**勘察实据（2026-10-18 实读，数字均实测）**：

- **apps/web F0 实态**：TanStack Router 文件式（`routes/__root.tsx`・`index.tsx`（deny-by-default loader 弹回 `/login`）・`login.tsx`）+ `lib/auth.ts`（BA 原生 fetch 门面·Cookie+DB Session·实机四步闭环已注记）+ `main.tsx` + `routeTree.gen.ts`；dev 反代 `/api → :7009`（`vite.config.ts`）。依赖仅 `react@^19.3` / `@tanstack/react-router@^1.170` / `vite@^8` / `tailwindcss@^4` / `@testing-library/react` / `jsdom`。
- **UI 基元现状**：`login.tsx` 为 raw Tailwind + `useState`，**无组件库**（§2.3② shadcn 按需·未落基元）→ 自助面初期沿用「按需最小自绘、不引整库」。
- **数据层参考实据**：okee `apps/okee/package.json` 仅 `@tanstack/react-router`（**无 react-query / swr / axios / openapi-fetch**）→ 取数 = router loader + fetch，无查询缓存库。据此立待裁点②。
- **接线缺口（本片核心前置）**：apps/web **未声明 `@saas/api-client` 依赖**；且 api-client `package.json` `exports/main/types → ./dist`（当前无 dist、无 source 导出条件）→ vite dev/build 消费需先 spike 解析方案（见 §3 风险），否则 `@saas/api-client` 在 web 侧解析断裂。
- **自助面 typed ops（F1 已覆盖·实采 `openapi/openapi.yaml` 46 paths）**：
  - **workspaces**：`GET /workspaces`（分页 `WorkspacePageResponse`）・`POST /workspaces`・`GET/PATCH/DELETE /workspaces/{id}`
  - **tenants 自助**：`GET /tenants`（我的租户）・`POST /tenants/active`（切当前）・`GET /tenants/members`・`POST /tenants/members/role|remove|leave`・`GET/POST /tenants/invitations`・`POST /tenants/invitations/cancel|accept|reject`・`GET /tenants/invitations/mine`
  - **subscriptions**：`GET /subscriptions/current`・`GET /subscriptions`
  - **users 自助**：`GET /users/me`・`DELETE /users/me`・`GET /users/me/data-export`
  - **会话面（例外）**：BA `sign-in/sign-out/get-session` **不在 Nest OpenAPI**（框架自挂载·F1 已注记非 SSOT 成员）→ 仍走 `auth.ts` 裸 fetch，**不进 api-client**。
- **errorCode 消费面就位**：F1 api-client re-export `@core` 单源码表 + `ApiError`/`errorCodeOf`——自助面「据 code 分支、据 message 展示」的前端侧兑现点。

**目标**：租户管理员在 web 上**看见并操作** workspace / 成员 / 邀请 / 当前订阅，全程经 F1 typed client 消费（编译期契约锁定），deny-by-default 会话墙与后端同向。

**非目标**：不做平台运营面（`platform/tenants`・`platform/users` 审批治理·另片）；不做前端容器化部署 / 生产反代（总纲 §3「部署留 F2 后专项」）；不引整组件库（§2.3②）；不改后端运行时/schema；不在本片背 Playwright 浏览器二进制（待裁点③）。

## 2. 方案

> 严格垂直切片、每片可独立验收（对齐 workflow §「切片塞进一个上下文窗口」）。**待裁点①**：范围切法。推荐 **F2a（只读可见）先行，F2b（操作）随后**，两片不并车。

### 2.1 F2a · 只读可见片

- **接线**：apps/web 加 `@saas/api-client`（workspace:*）+ 解析方案（§3 风险·首日 spike）；新建 `lib/api.ts` 造 typed 客户端单例（`createApiClient()`·同源相对·`credentials:'same-origin'`），BA 会话面维持 `auth.ts` 不变。
- **路由/页**（loader 取数 + deny-by-default）：
  - `/workspaces` 列表（`GET /workspaces`·分页可见·空态）
  - 租户上下文：`/`（升级现 dashboard）显示我的租户（`GET /tenants`）+ 当前订阅摘要（`GET /subscriptions/current`）
  - `/settings/members`（`GET /tenants/members`·只读成员表）
- **判据**：Vitest + testing-library 组件/渲染测（typed data 渲染 · 空态 · 错误窄化 `errorCodeOf`）覆盖新页；`@saas/api-client` 在 web 侧类型解析通；`pnpm run ci` L1 全绿·基线只增不减。

### 2.2 F2b · 操作片

- **mutation 面**（成功 → 重载/失效，失败 → `ApiError.message` 展示 + 据 `errorCode` 分支）：
  - 邀请：发/撤（`POST /tenants/invitations`・`/cancel`）· 接受/拒绝（`/accept`・`/reject`）· `invitations/mine`
  - 成员：改角色 / 移除 / 退出（`members/role|remove|leave`）
  - workspace：新建 / 改名 / 删除（`POST/PATCH/DELETE /workspaces`）
  - 切换当前租户（`POST /tenants/active`）
- **判据**：组件测覆盖成功/失败两分支；关键路径以 dev 反代真跑取数验证（DB-free 组件测 + 手证·非 Playwright）；L1 全绿基线只增不减。

### 2.3 待裁点（呈审时逐条裁，未裁不动）

- **① 范围切法**：**甲 = 分 F2a 只读 / F2b 操作两片串行**（推荐·防 scope 蔓延·每片可独立验收·对齐切片纪律）；乙 = 一次做完自助全面（单片体量大·验收粒度粗）。
- **② 数据获取层**：**甲 = router loader + `@saas/api-client` 裸调**（推荐·okee 同款·零新依赖）；乙 = 引 `@tanstack/react-query`（缓存/自动失效·但增依赖与 npmmirror 对拍面）。若选乙，实施首日对拍 registry 可得性并登记。
- **③ Playwright 是否采**（总纲 §2.3① 明定 F2 重呈）：**甲 = 本片缓采**（推荐·延续 F0 裁·Vitest 组件测覆盖渲染/交互，真浏览器 e2e 随「前端部署面」片另呈，避免本片引入浏览器二进制 + CI 变重）；乙 = 本片即采（自助关键链真浏览器回归·代价：二进制经 npmmirror 安装 + CI 时长）。
- **④ `@saas/api-client` 消费解析方式**：**甲 = 根 `build` 纳入 api-client 构建步（产出 dist·web 走 exports→dist）**（推荐·与后端产物一致·单一构建口径）；乙 = api-client 增 `exports` 的 `development`/bundler 条件直指 `src/*.ts`，vite 端源码消费免预构建（轻量但双解析口径）。首日 spike 定，拓不动则登记 §6 降级。
- **⑤ UI 基元深度**：沿用总纲 §2.3② **shadcn 式按需**（已裁·不引整库），本片表格/表单 raw Tailwind 最小自绘；仅当复杂度外溢再逐基元按需复制。

## 3. 影响面与风险

- **blast radius**：`apps/web/*`（新增路由/页/lib）+ `apps/web/package.json`（api-client 依赖）+（若裁④甲）根 `package.json` build 步。**不改**：后端运行时代码、schema/迁移、Dockerfile/compose、husky/commitlint、`docs/specs`。
- **命中高危清单**：无（前端模块面·非宪法/非门禁；若改根 build 步属构建实现面，非 §2 高危门禁）。
- **主要风险**：
  1. **api-client 解析**（待裁点④）：`exports→./dist` 且当前无 dist/无 source 条件，web 直接 import 会断——首日 spike「构建产 dist vs 源码条件导出」取一，拓不动登记 §6。
  2. **npmmirror 滞后**（若裁②乙 / ③乙引入新包）：实施首日正式对拍 registry（本仓有滞后先例），滞后降版并登记。
  3. **scope 蔓延**：以 §2.1/§2.2 分片 + 非目标钉住。
- **回滚**：F2a/F2b 全可逆——删新增路由/lib + 还原 apps/web package.json（+ 根 build 步）即净；后端与 F1 制品零触动。

## 4. 审计记录

> 无已审方案不写码。跨前后端消费面 → 人签核。

- 结论：**已审计·放行**——人 2026-10-18 令「同意」：§2.3 五待裁点全采推荐档
  （①甲·分 F2a 只读/F2b 操作两片串行；②甲·router loader + api-client 裸调；③甲·本片缓采 Playwright；④甲·根 build 纳入 api-client 构建步·web 走 exports→dist；⑤甲·shadcn 按需）。即刻实施 F2a。
- 未决项：无（api-client 解析方式按 §3 风险走首日 spike，拓不动按既定降级档处置并登 §6，非未决）。
- 审计人 / 日期：人 / 2026-10-18。

## 5. 完成判据（可核验 + 穷尽）

- [x] §2.3 五待裁点获人裁定（令「同意」= 推荐档全采）
- [x] F2a：apps/web 消费 `@saas/api-client` typed 通（④甲 spike 定案：`build:client` 产 dist（含 schema.d.ts 拷贝步）·web `moduleResolution:bundler` 走 exports→dist·**typecheck EXIT=0 + vite build 打包通**）；`/workspaces` typed 列表 / 首页订阅摘要（SubscriptionResponse）/ `/settings/members`（BA 透传·诚实防御渲染）落地，deny-by-default（`requireSession`）与后端会话墙同向
- [ ] F2b：邀请 / 成员 / workspace / 切当前租户 操作面落地，mutation 成功重载、失败据 `errorCode`/`message` 反馈
- [ ] 新页组件测覆盖渲染 / 空态 / 错误窄化（**F2a 已达成**：WorkspacesView/SubscriptionView/MembersView typed+空态测 + format 错误窄化单测·共 14 新测）；关键路径 **dev 反代真跑端到端**（需起 DB+后端+登录态）——本轮未跑，归人类验收执行（非 Playwright）
- [x] `pnpm run ci` L1 全绿（基线只增不减·F1 后 540/31·92 → **F2a 554/31·96 files**·+14 测/+4 测文件·skip 稳 31）
- [x] 后端零改动、F1 制品零触动（`git status` apps/api 无改动·契约锁测 `api-contracts.test.ts` 仍绿）
- [ ] 人类验收（F2a、F2b 各自单独验收）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-18 | 0.1.0 | 总纲 F1 结项后按 §2.2 串行呈 F2 | 首版呈审：apps/web F0 实态 + okee 数据层实据（无 query 库）+ 自助面 typed ops 清单（实采 openapi.yaml）+ 接线缺口（web 未依赖 api-client·exports→dist 无 dist）+ 五待裁点（含总纲 §2.3① Playwright 重呈） |
| 2026-10-18 | 0.2.0 | 人令「同意」过审计门 | §4 翻「已审计·放行」（五裁点推荐档全采）；§5 首框勾；戳翻实施中（即刻起 F2a）。 |
| 2026-10-18 | 0.3.0 | F2a 只读可见片实施落地 | 接线：根 `build:client` 步 + `packages/api-client` build 补 `cp schema.d.ts`（tsc 不复制生成 .d.ts）+ apps/web `@saas/api-client` 依赖 + `lib/api.ts` 单例（同源空 basePath）。页面：`/workspaces`（typed 分页表）·首页订阅摘要（SubscriptionResponse）·`/settings/members`（BA 透传·防御渲染·诚实标注非 Nest 契约形）。测：三 View typed/空态 + `format.test.ts`（errorCodeOf 窄化）=+14。L1 PASSED 554/31·96。**自捕**：openapi-fetch `new Request(相对URL)` 在 jsdom（undici 不解析 document base）抛错 → 弃 router+fetch 集成测（环境限制非产品缺陷·浏览器同源正常），端到端归 dev 反代真跑（未跑·待人类验收）。**降档**：members 系 F1 passthrough 面（无 Nest typed 契约）不假称 typed。 |

---

<!-- 变更戳 -->
正文已于 2026-10-18 / v0.3.0 更新（**F2a 已实施·待人类验收**——typed 接线+三可见页+组件测落·L1 554/31·96 只增不减·后端/F1 零触动；F2b 操作片与 dev 反代真跑待下一环）；发现登 §6 不入正文。
