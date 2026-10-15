# i18n / 邮件模板的**产物资产解析**修复（生产静默失效：译文回退 key + 发信 ENOENT）

> 适用范围: `模块(i18n + mailer) · 触构建资产声明` ← blast radius：两源文件 + `nest-cli.json` assets，不触 DB / 不触部署契约（缓行方案 A 才触，见 §3）
> 关联: `specs/tooling-standards.md` §4.9（横切设施落位）/ §4.10（部署声明对拍）· `plans/global-cn-adaptation.md`（FR-5/L1 默认中文）· `plans/global-runtime-node-pnpm.md` §4.12（本案由其残留观察立项）· 同型先例 **R-δ**（`plans/global-runtime-node-pnpm.md` §4.8：测试绿 ≠ prod 可跑的潜伏债）
> 性质: 缺陷修复（机制单点修，不逐模块特判）
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**现象（本轮实机坐实，非推测）**：编译产物运行时，nestjs-i18n **一条译文都取不到**，全部回退为 key；邮件 MJML 模板路径**指向不存在的目录**，真发信会抛 `ENOENT`。

```jsonc
// tmp 探针（对编译产物 dist 单模块 boot，验毕已删）——生产语义：
{ "modulePath": ".../dist/apps/api/src/i18n/i18n.module.js",
  "validate.email.required(zh)": "validate.email.required",   // ← 应为「请输入邮箱」
  "login.hello(zh)": "login.hello",                            // ← 应为「你好 Nestjs」
  "hit": false }
// 对照：vitest（源码语义）apps/api/src/i18n/validation-i18n.e2e.test.ts → 4 passed ✓
```

**根因（两套路径语义不一致）**：

| 侧 | 语义 | 落点 |
|---|---|---|
| 编译（tsc/swc） | `tsconfig.json` `include: ["apps/**","libs/**"]` + `outDir: dist`、**不设 `rootDir`**（历史为容 `@core/*` 跨包源避 TS6059，见 P2d 记录）→ 产物保留目录前缀 | `dist/apps/api/src/i18n/i18n.module.js` |
| 资产（nest-cli `assets`） | glob 相对 `sourceRoot` 且**剥掉 `sourceRoot` 前缀**拷到 outDir 根 | `dist/i18n/{zh,en,ja}/*.json` |

而 `i18n.module.ts` 用 `dirname(import.meta.url)` 作 loader 根、`mailer.service.ts` 用 `dirname/../i18n/emails` 作模板根——**两者都锚在编译侧目录**，那里只有 `.js`，没有 json/mjml：

```
dist/apps/api/src/i18n/  → 仅 i18n.module.js(.map)          ← loader 实际读的目录
dist/i18n/               → zh/ en/ ja/ emails/（正确的资产） ← 没人读它
dist/apps/api/src/i18n/emails/  → MISSING → readFile ENOENT
```

**为何长期未暴露**：① 单测用 fake `I18nService`（`mailer.service.test.ts`）从不触真装载；② `validation-i18n.e2e.test.ts` 在**源码树**跑（`dirname` 恰好等于资产目录）；③ 校验消息本地化只在**有会话 + 校验失败**时才被观察到；④ 该失配由 `62a5293`（`src`→`apps/reference/src` 目录搬迁）引入——搬迁前 `include` 为单一根 `src/**/*`（隐式 `rootDir = src`），编译产物与 assets **同落 `dist/i18n`**，故「`__dirname` 开发/生产通用」当时成立；搬迁将 `include` 改为 `apps/**` + `libs/**`（隐式 `rootDir` 上提至仓库根）后编译侧变嵌套而资产侧仍剥前缀，**失配静默诞生且无任何门禁报警**。S5 把 `__dirname` 换成 `import.meta.url` 推导（`3fdbbde`）只保证「与 CJS 同值」，**未改变目录层级**，与本案正交。

**目标**：让产物运行期能真正取到译文与模板，并把这类「装载失败」从**静默回退**改为**启动即失败**。
**非目标**：不动 i18n 语言集/键位契约；不动 `mailer` 发送逻辑；不做微服务/多产物拆分；不借机改部署布局（方案 A 缓行）。

## 2. 方案

- **切片 A｜资产根单点解析 + fail-closed（核心机制修）**
  新增 `apps/api/src/i18n/assets-root.ts`，导出 `resolveI18nAssetsRoot()`：按候选根顺序探测**含 `zh/` 子目录**的那个（候选 1 = `dirname(import.meta.url)`（源码 / 同层布局）；候选 2 = 自 `dirname` 上溯至 `dist` 根的 `i18n`（当前嵌套产物布局）），**全部落空则抛错并打印已试路径**（fail-closed，与数据驻留守卫同精神）。
  `i18n.module.ts` 的 `loaderOptions.path` 与 `mailer.service.ts` 的模板根**改为同一 helper 调用**（单点机制，不在两文件各写一套兜底）。
  判据：`dist` 语义探针 `hit: true`（zh/en 命中真实译文）；源码语义（vitest）不回归；helper 在人造「资产缺失」场景下**启动抛错**（新增断言测）。

- **切片 B｜资产 glob 收紧（消源码泄漏）**
  `nest-cli.json` `assets` 的 `i18n/**/*` 收窄为只拷数据/模板（`*.json` / `*.mjml`，`.hbs`/`.proto` 维持原条目），使 `i18n.module.ts`、`validation-i18n.e2e.test.ts` 不再进产物（现状实锤：`dist/i18n/i18n.module.ts` 与 `dist/i18n/validation-i18n.e2e.test.ts` 存在 → 随 `COPY dist` 进生产镜像）。
  判据：`find dist -name '*.ts' -path '*i18n*'` 为空；镜像内同检。

- **切片 C｜防线门禁化（防回潮）**
  把本轮 tmp 探针固化为 `scripts/verify-i18n-assets.ts`（对 `pnpm run build` 产物 boot 最小 i18n 图，断言译文命中 + 模板文件可读），并挂进既有 prod 防线链（`verify:prod-boot` 之后或合并），使「测试绿但产物空」成为**门禁级失败**。
  判据：故意把 assets 声明改坏 → 该脚本非零退出；恢复后 `pnpm run ci` 全绿。

- **缓行（不在本切片做）**：**方案 A′**＝给编译侧设 `rootDir` 使产物扁平（`dist/main.js`），语义最干净，但要同改 `Dockerfile` CMD、`start:prod`、`verify-prod-boot`、镜像路径 = 触部署契约（高危），且 S3d 后 `@core/*` 已改走 node_modules 解析、`rootDir` 是否仍触发 TS6059 需独立 spike → 另案。

## 3. 影响面与风险

- **blast radius**：`apps/api/src/i18n/{assets-root.ts(新),i18n.module.ts}`、`apps/api/src/mailer/mailer.service.ts`、`nest-cli.json`（+ 根与 app 两份需一致）、`scripts/verify-i18n-assets.ts`(新) + `package.json` script。**无 schema 变更、无依赖增删、无 API 契约变更**。
- **命中高危清单**：改 `nest-cli.json`（构建面）+ 新增门禁脚本（门禁面）→ **须人签核后方可实现**。
- **R-α 行为可见变化**：修复后 HTTP 校验失败消息由 key（`validate.email.required`）变中文——**属回归修复但改变对外响应文本**；若有下游按字面 key 断言则受影响（全仓检索消费方零，实现期复核）。
- **R-β fail-closed 双刃**：helper 抛错会让「资产没拷对」的部署**启动即挂**（优于静默发 key/抛 ENOENT，但把风险从运行时功能面移到启动面）；须同步写进 `docs/docker-deployment.md` 排障条目。
- **R-γ 双份 nest-cli.json**：根 `nest-cli.json` 与 `apps/api/nest-cli.json` 内容重复，历史上易漂移（现两处 assets 已同构）；本切片照改两处，**不做合并**（合并属构建配置重构，另案）。
- **可逆性**：全片可 revert 单 commit；无数据面。
- **副产发现（不属本案·只登记）**：`mailer.service.ts:37` 注释称「`MailerModule.forRoot` 已接线 I18n」**与实际不符**（实为全局 `AppI18nModule` 提供，`MailerModule` 无 forRoot）——属另一处「声明有、实现无」型文档漂移，归入切片 B 顺带订正注释即可，不单开 plan。

## 4. 审计记录

> 无已审方案不写码。本片触构建/门禁面 → 人签核。

- 结论：**已审计**（人于 AskUserQuestion 批准「**三切片开工**」（触 `nest-cli.json` 构建面 + 新增门禁脚本 = 高危签核）·门禁挂点择「**独立 script**」（与 `verify:prod-boot` 同构·各自可单独跑·**不进 `pnpm run ci` 链**，因 ci.ts 固定为 check→build→test + fallow advisory）·plan 文档择「**不单独提交**」→ 与实现同 commit 留痕）。未决项定档：① helper 不预设布局（向上探测）天然兼容未来 `rootDir` 扁平方案；② 取独立 script；③ R-α 响应文本变化已在下方实证单列存照。
- 审计人 / 日期：人（FDE）/ 2026-10-15

## 4.1 落地实证（三切片全完成·2026-10-15）

- **切片 A**：`apps/api/src/i18n/assets-root.ts`——`resolveI18nAssetsRoot()` 从本模块目录**逐级上溯**，每级先试 `dir` 自身（源码布局）、再试 `dir/i18n`（产物布局：上溯至 `dist` 取其 `i18n`），判据 = 其下有 `zh|en|ja` 之一；全落空抛错并列出已试路径。`i18n.module.ts` loader 根与 `mailer.service.ts` 模板根**同源于此**（grep 坐实仓内已无第二套 `dirname/../i18n` 硬拼；顺带清除已失效的 `fileURLToPath` 导入）。
- **切片 B**：两份 `nest-cli.json` 的 `i18n/**/*` 收窄为 `i18n/**/*.json` + `i18n/**/*.mjml`。实跑结果：`dist/i18n` 含 12 份 json + 3 份 mjml；**`find dist -name '*.ts' -not -name '*.d.ts'` 为空**（原 `dist/i18n/i18n.module.ts` + `validation-i18n.e2e.test.ts` 源码泄漏已消，不再随 `COPY dist` 进生产镜像）。
- **切片 C**：`scripts/verify-i18n-assets.ts` + `package.json` `verify:i18n-assets`（仅 node 内建 + 既有 devDep `@nestjs/testing`，不引新工具）。

**产物面翻绿存照（`pnpm run verify:i18n-assets`）**

```
✓ 产物资产根解析 → <repo>/dist/i18n
✓ translate zh/validate.email.required → 请输入邮箱
✓ translate en/validate.email.required → Please enter your email address
✓ translate zh/emails.welcome.subject → 欢迎加入Nestjs
✓ 模板可读 welcome.mjml（734B）/ verification.mjml（749B）/ forgot-password.mjml（757B）
✓ fail-closed 生效：资产缺失即抛错
i18n assets PASSED — 产物译文/模板/fail-closed 三面全绿      EXIT=0
```

（对照立项前：同探针 `hit:false`、译文全回退 key。）

**负向实证**（临时 `mv dist/i18n` 再跑）：**EXIT=1** 并报「i18n 资产根解析失败…已试路径」；恢复后 EXIT=0 —— 证明本防线真的能咬。

**门禁与基线**：`pnpm run ci` **PASSED**（EXIT=0）·Biome `Checked 306 files · No fixes applied`·**Tests 330 passed | 16 skipped（总 346）**——较基线 343 **+3**（即 `assets-root.test.ts` 新测），旧基线零掉；`verify:prod-boot` **EXIT=0** /health 200；相关面 `pnpm vitest run apps/api/src/i18n apps/api/src/mailer` **11 passed**（含 `validation-i18n.e2e.test.ts` 4 测不回归、`mailer.service.test.ts` 4 测不回归）。

**R-α 实证订正**：本片修复的是**编译产物**运行时的回退 key（已探针存照）。**未做带会话的真实 HTTP 校验失败存照**（需真登录链路·本片不外发也不登录）——按现有门禁与探针证据登记为**已机制修复 + 产物面实证**，对外响应文本由 key → 中文的后果已在 `docs/mailer-en.md` / `docs/docker-deployment.md` 写明。

**副产发现顺带订正**：`mailer.service.ts:37` 失实注释（称 `MailerModule.forRoot` 接线 I18n）已改为「由全局 `AppI18nModule` 提供」。

**未做（据实登记）**：缓行方案 A′（`rootDir` 扁平化）未动·仍属另案；`.qoder/repowiki` 知识卡仍为 IDE 生成物待再生。

### 4.2 镜像层重建对拍（2026-10-15·承接 `global-runtime-node-pnpm` 结项残留观察的验证位）

境内 DNS 污染本轮复现（Docker VM 网络栈解析 `registry.npmmirror.com` ENOTFOUND，`docker build --network=host` 仍不通——其「host」指 VM 而非宿主）。绕行：**buildkit 容器自钉 `--dns 223.5.5.5` + TCP 暴露 + buildx remote driver** 构建，`--output type=tar` 导出后 `docker import` 成镜像，跑真容器对产物（临时设施验毕已清零；系统 DNS 已还原并 md5 与原值 `ccd28ae0…` 比对一致）：

- **镜像内资产布局**：`dist/i18n/{zh,en,ja}` 各 3 JSON + `emails` 3 MJML；`find dist -name '*.ts' -not -name '*.d.ts'` = **0**（切片 B 在镜像层同样生效）
- **镜像内解析**：编译后的 `resolveI18nAssetsRoot()` → `/app/dist/i18n`，`resolveEmailsDir()` → `/app/dist/i18n/emails`（切片 A 在产物布局下命中上溯分支）
- **启动 + 探针**：应用成功 boot；Dockerfile 同款 node fetch 探 `/api/v1/health` **exit 0**（含 `external-ip-check` 外网面在容器内已通）
- **fail-closed 在镜像层成立**：容器内 `mv /app/dist/i18n` 后启进程即断 `Error: i18n 资产根解析失败：自 /app/dist/apps/api/src/i18n 向上…`，不静默回退

**对拍顺带坐实两条部署面事实**（**不属于本片修复范围**，据实登记待人裁）：① `.env` 默认 `HOST=localhost` → 容器内只绑回环，不加 `-e HOST=0.0.0.0` 则发布端口永远 502（来自 Docker 代理、不进应用）——Dockerfile 未内嵌该默认，属 `docs/docker-deployment.md` / 模板层待补；② PIPL 驻留守卫按设计拒绝容器名主机与非境内 storage region，本轮回拍需改用容器 IP + `STORAGE_REGION=cn-north-1` 才能 boot——行为正确但排障门槛高，建议文档加一句提示。

### 4.3 带会话的真实 HTTP 校验失败存照（2026-10-15·补 §5 那一条 `[~]` 欠账）

**被验对象与环境**：编译产物真进程（`pnpm run build` 后 `node dist/apps/api/src/main.js`·`PORT=7099`·`HOST=127.0.0.1`·`NODE_ENV=development`）+ 真 Postgres（dev 库）+ **真 Better Auth 会话**（HTTP `POST /api/v1/auth/sign-up/email` 200 → `sign-in/email` 取 BA 自签 `better-auth.session_token` cookie·全程无认证桩）。选 `POST /api/v1/tenants/applications` 作被测路由——它带 `@UseGuards(SessionGuard)` 且类级 `@TenantExempt()`，即**只需会话、不需 active organization**（避开建租/审批链路），其 `CreateTenantApplicationDto` 携 `validate.name.*` / `validate.slug.*` 键。

| # | 请求 | 结果 |
|---|------|------|
| ① | 无 cookie + `Accept-Language: zh-CN` + 非法体 | **401** `Missing or invalid session` ⇒ 会话墙先于校验管道（即“带会话”确为必要条件·非可省） |
| ② | 真会话 + `zh-CN` | **400** `message: ["请输入名称","标识符仅可包含小写字母、数字和连字符"]` |
| ③ | 真会话 + `en-US` | **400** `["Please enter a name","Slug may only contain lowercase letters, digits and hyphens"]` |
| ④ | 真会话 + 无 `Accept-Language` | **400** 中文（兜底 `zh` 与 `main.ts:86` 注释一致） |
| ⑤ | 真会话 + `ja-JP` | **400** `["名前を入力してください",…]` ⇒ `dist/i18n/{zh,en,ja}` 三语集在产物布局下均可读 |

响应外形未变（`statusCode/message/error/timestamp/path/requestId`），只 `message` 由译文给出——即 §3 R-α 的预期变化已在真链路上得到正例。**修前 HTTP 态未复现**（需 revert 重构建·不作已验声称）；“回退为 key”那一面已由 §4.1 立项前探针 `hit:false` 与修复后翻绿存照。

**取证不污染现场**：未改任何仓库文件（取证全程 `git status` 空）；夹具已清—dev 库 `session` 删 2 / `account` 1 / `user` 1（`consent` 0）、`verification` 无孤儿行（两面计数均 0）；`/tmp` 探针文件（cookie/响应体/启动日志）已删净（残留 0）；服务进程已停、端口 7099 已释放。附带坐实一条与本片无关的路由事实：BA `basePath=/api/v1/auth` 按字面注册、不被全局前缀二次叠加（`/api/api/v1/auth/*` 为 404）。

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A：产物语义探针 `hit: true`（`validate.email.required` → `请输入邮箱`，`en` 命中真实英文）；源码语义 `validation-i18n.e2e.test.ts` 4 测不回归
- [x] 切片 A：资产缺失人造场景下 `resolveI18nAssetsRoot()` **抛错**（新断言测入 CI，非静默回退）
- [x] 切片 A：`mailer` 模板根与 i18n loader 根**同源于一处 helper**（grep 确认无第二套 `dirname/../i18n` 硬拼）
- [x] 切片 B：`find dist -name '*.ts'` 无 i18n 源/测试泄漏；`pnpm run build` 产物内含 `dist/i18n/{zh,en,ja}` 与 `emails/*.mjml`
- [x] 切片 C：`scripts/verify-i18n-assets.ts` 就位（独立 script·人裁）；改坏资产布局可使其非零退出（**负向实证 EXIT=1 已做**）
- [x] 实机：产物面已存照（探针三面翻绿）；**带会话的真实 HTTP 校验失败存照已补（§4.3）**——编译产物真进程 + 真 BA 会话 + 真 HTTP：无会话 401（墙先于管道）·zh/en/ja 三语译文命中·无头兜底中文·响应外形不变；修前 HTTP 态未 revert 复现（据实登记·机制面已由 §4.1 存照）
- [x] `pnpm run ci` 全绿（基线 **343 → 346（330/16）**·新增 3 测）+ `verify:prod-boot` /health 200
- [x] 文档：`docs/mailer-en.md` 资产解析口径重写 + `docs/docker-deployment.md` 排障条目（含 `mailer.service.ts:37` 失实注释订正）；本 plan 回写实证；索引状态翻面
- [x] 镜像层重建对拍（§4.2）：产物镜像内**四项实测全绿**（资产布局含游离 `.ts`=0 / `resolveI18nAssetsRoot()` → `/app/dist/i18n` / health 探针 exit 0 / fail-closed 拦 boot）——`global-runtime-node-pnpm` 结项残留观察的镜像面验证位由此闭环

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-15 | 0.1.0 | 运行时修宪结项残留观察→人裁「同意，继续」立项取证 | 首版：实机坐实生产译文全回退 key（`hit:false`）+ 邮件模板目录 MISSING（ENOENT）；根因定为「编译保留 `apps/api/src` 前缀 vs nest-cli assets 剥前缀落 `dist/i18n`」两套语义不一致，且锚点在编译侧目录；溯源 `62a5293` 目录搬迁引入的潜伏债（同 R-δ 型）；方案 = 切片 A 资产根 helper + fail-closed／切片 B assets glob 收紧消 `.ts` 泄漏／切片 C 探针门禁化；`rootDir` 扁平化为缓行方案 A′（触部署契约·需独立 spike） |
| 2026-10-15 | 0.2.0 | 人签核「三切片开工 + 独立 script + plan 不单独提交」·实现完成实证全绿 | 新增 §4.1 落地实证：切片 A `assets-root.ts`（向上探测 + fail-closed·两消费方同源）/ 切片 B 两份 `nest-cli.json` 收窄为 `*.json`+`*.mjml`（产物内 `.ts` 泄归零）/ 切片 C `scripts/verify-i18n-assets.ts` + `verify:i18n-assets`（不进 ci 链）；产物面 `hit:false`→**三面翻绿**（zh/en 译文命中 + 3 份 mjml 可读 + fail-closed 生效）；**负向实证 EXIT=1**（移走 dist/i18n）后恢复 EXIT=0；`pnpm run ci` PASSED · **基线 343→346（330/16）**·新测 +3·旧基线零掉；`verify:prod-boot` 200；文档订正（mailer-en 重写资产段 + docker-deployment 排障第 4 条 + mailer 失实注释）；§5 判据逐项勾选（带会话 HTTP 存照一项据实留 `[~]`） |
| 2026-10-15 | 0.3.0 | 人择「① 补镜像层重建对拍」| 新增 §4.2 镜像层对拍：buildkit `--dns` 绕行构建（VM DNS 污染复现·`--network=host` 不足以绕过）+ tar 导出 `docker import` + 真容器；镜像内四项实测全绿（资产布局含游离 `.ts`=0 / 资产根解析 `/app/dist/i18n` / health 探针 exit 0 / fail-closed 拦 boot）；临时设施（容器·builder·网络·镜像·含密钥 env 副本）已清零；系统 DNS 已还原（宿主 `sudo`·md5 与原值一致）；不阻断本拍结论；顺带登两条非本片范围的部署面事实（`HOST=localhost` 默认致发布端口 502 / 驻留守卫对容器名主机与非境内 region 的 boot 门槛）；§5 新增镜像层对拍判据一条（带会话 HTTP 存照仍 `[~]`）|
| 2026-10-15 | 0.3.1 | 宿主 `sudo` 完成系统 DNS 还原 | 仅状态订正：§4.2 与索引行的「DNS 待还原」→「已还原·md5 与原值一致」；对拍结论与判据无变动 |
| 2026-10-15 | 0.3.2 | 人「继续」→ 结清本片最后一个 `[~]` 欠账（带会话真实 HTTP 存照） | 新增 §4.3：编译产物真进程（`node dist/apps/api/src/main.js`·7099·dev 库）+ **真 BA 会话**（HTTP sign-up→sign-in 自签 cookie·无认证桩）打 `POST /api/v1/tenants/applications`（`SessionGuard`+`@TenantExempt`·只需会话不需 active org）五态全如预期：**① 无会话 401（会话墙先于校验管道）·② zh-CN → 「请输入名称/标识符仅可包含…」（400）·③ en-US → 英文 ·④ 无 `Accept-Language` → 兜底中文 ·⑤ ja-JP → 日文**（⇒ 三语集在产物布局下均可读·`message` 已非裸 key）；响应外形未变（R-α 止于 `message`）。取证零仓库变更（`git status` 空）、夹具已清（dev 库 user/account/session 1/1/2 删除・consent 0・verification 无孤儿・/tmp 归零・端口释放）；修前 HTTP 态未 revert 复现（据实登记）。§5 该条由 `[~]` 翻 `[x]`⇒**本片判据无开放项**（缓行方案 A′ 仍另案） |

---

<!-- 变更戳 -->
正文已于 2026-10-15 / v0.3.2 变更（§4.3 带会话真实 HTTP 校验失败存照已补·§5 末条 `[~]` 翻 `[x]`），以当前正文内容为准。
