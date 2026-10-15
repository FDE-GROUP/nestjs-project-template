# 配置供给面的**四角契约漂移**与 Google 登录渠道「文档承诺有、实现无」

> 适用范围: `配置面(.env.example + apps/api/src/config/**) + 文档/宪法路径口径(docs/specs + AGENTS.md + docs/oauth-guide-en.md)` ← blast radius：**本阶段零代码**（立案勘察）；落地后最宽触 `envs/default.ts`、`.env.example`、`docs/specs/*`，**不触 DB schema / 不触业务模块 / 不触部署编排**（`docker-compose.yml` 不在本片）
> 关联: `specs/tooling-standards.md` §4.10（部署声明对拍）· 已落地前片 [module-deploy-env-mount-boundary](./module-deploy-env-mount-boundary.md)（D4·**F4/F6 与其 `.env.example:18` 逃生阀直接续接**）· [module-deploy-host-residency](./module-deploy-host-residency.md) §5 缓行清单（本片领取其「`envs/` 文档漂移」一项）· global-tenancy §10 挂账（本片结清 dead-code 两项）
> 性质: 缺陷收口（配置契约的供给面完整性 + 宪法承诺兑现）·机制单点修、不逐键特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**缘起**：D4 收口后，「配置事实由谁给出」这条线在编排面已经闭合，但**它下面还压着一层同样的问题**：`.env` / `.env.example` / Joi 校验 schema / 代码实际读取集**四份契约彼此从未对拍**。本轮按人「继续」做只读勘察，把前片遗留的缓行/挂账（host-residency §5 三条 + global-tenancy §10 两条）逐项核到底，结果既结清了三条旧账（F8），也**新查出一处宪法承诺落空的具体缺陷**（F3·本片定级依据）。

### 事实（八条，均为文件/代码事实或本轮直查，非推测）

**F1 · 四份「配置契约」互不校验，且 `allowUnknown: true` 让一切错位静默通过**

| 契约 | 载体 | 规模（本轮脚本实测） |
|------|------|------|
| 开发机实文件 | `.env`（未追踪） | 50 键 |
| 出厂样例 | `.env.example` | 51 键 |
| 校验层 | `config.module.ts` `createSchemaForEnv` 的 Joi 对象 | 27 键 |
| 消费层 | `process.env.X` 直读 51 键 + `configService.get('K')` 字面键 7 键 | 合集 58 键 |

`configModuleOptions.validationOptions = { allowUnknown: true, abortEarly: false }` ⇒ **多键、漏键、拼错键全部静默通过**；四象交叉比对本轮用脚本一次性算出（下列 F2/F3/F4 即其结果），**而仓库内没有任何门禁持有这套对拍**。

**口径教训（直接影响切片 C 的实现）**：只扫 `process.env` 会把 `MAIL_HOST` / `MAIL_USER` / `MAIL_FROM` / `APP_URL` 误判成死配置——它们实际经 `mailer.service.ts:27/31/103/112` 的 `this.configService.get('MAIL_HOST')` 消费（@nestjs/config 回落 `process.env`）。**这正是 AGENTS §2「静态分析结论必须二次人工核验」的现场版**，任何门禁化的读取集解析必须同时覆盖两种模式。

**F2 · 双文件分叉（D4 的 F6 具体化）**

- 仅开发机 `.env` 有：`DATADOG_API_KEY` / `DATADOG_HOST_NAME` / `DATADOG_INTAKE_REGION` / `DATADOG_SERVICE_NAME`——而 `config.module.ts:47` 注释明载「**Datadog 已移除（G1 / D6）**」⇒ 四个**无任何消费方的已删能力残留键**（属机器侧文件，仓库无物可改，但样例无从提醒使用者清理）。
- 仅 `.env.example` 有：`EVENT_STORE_ENABLED`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`OAUTH_GENERIC_PROVIDERS`、`PLATFORM_OPERATOR_EMAIL`——**开发机漏配这五项照样 boot**（靠内置默认），于是「按样例配的人」与「按需补的人」跑的是不同语义。
- 按上述口径，**全仓零消费方的声明键恰好只有 6 个**：`DATADOG_*` ×4（仅开发机）+ `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`（**两份文件都有**）⇒ 前者是已删能力的机器侧残留，后者是 F3 缺陷的组成部分（**样例给了槽位、代码没有槽位**）。

**F3 · Google 登录渠道：宪法四处承诺 + 文档教用户这么配，代码里没有槽位（本片定级依据）**

- 承诺面：`docs/specs/vision.md:65`（「Google / GitHub 等海外 OAuth……予以保留」）、`docs/specs/tooling-standards.md:56`（登录渠道行「Google/GitHub（保留）」）、`docs/specs/glossary.md:40`、`README.md:43` **四处**均写「保留 Google/GitHub」。
- 教面：`docs/oauth-guide-en.md:72` 明确让用户写 `OAUTH_PROVIDERS=github,google`；:130 还给了 Google 控制台链接。
- 实现面：`envs/default.ts` 的 `oauth.secrets` **只有 `github` / `apple` / `feishu` 三个槽位**；`auth.bootstrap.ts:87-100` `buildSocialProviders()` 对每个启用的 provider 做 `const config = oauth.secrets[type]; if (!config?.clientId || !config.clientSecret) continue;`（:95）⇒ **`google` 被静默跳过**，既不报错也不告警。
- 消费面：全仓（含 `apps/api` / `libs/core` / `scripts` / 文档）**`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 零消费方**，而 `.env.example:91-92`（段头还写着「# OAuth Providers - Google (example)」）与开发机 `.env:90-91` 都摆着这两行——**给了「可配」的假象**（且两文件的 `OAUTH_PROVIDERS` 默认行分别是 `github,apple` / 代码兜底 `github`，均未列 google——即使列了也没有槽位）。
- `auth.constant.ts` 的 `OAuthProviderType` 里 `GOOGLE='google'` 在枚举中（故不会被类型过滤掉），进一步说明失败点是**缺 secrets 槽位**而非类型不认识。

⇒ 与 D3（`docker-deployment.md:116` 把拒启归给模板并不存在的默认值）**同型的「声明有、实现无」**，且与已收口的 i18n 片（邮件资产根在产物布局下不存在·注释与实际不符）构成同一类先例；但本处更严：落在**宪法承诺 + 入门文档**上，失效路径是**静默跳过**——使用者照文档配完，Google 登录不可用，日志零线索。

**F4 · 代码读取、两份文件都未声明的 9 个键**

`AUTH_TRUSTED_PROXIES` / `DATA_RESIDENCY_ENFORCE` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` / `LOG_LEVEL` / `LOG_FILE` / `PAYMENT_PROVIDER`（应用与守卫面）+ `VERIFY_PORT` / `VERIFY_TIMEOUT_MS` / `NO_COLOR`（`scripts/` 防线面）。
前三者**在样例里全是注释态**（`.env.example:116` / `:18` / `:20`），即样例声明了它们、却没给出「生产必须处理」的强度；本轮 D4 四态取证的 (c) boot 日志里就实测出现过 `AUTH_TRUSTED_PROXIES 未配置……限流将把所有用户归入共享桶` 这条 warn——**症状已在真容器上拍到，但出厂样例对此无提示**。
更硬的一条：**`AUTH_TRUSTED_PROXIES` 与 `PAYMENT_PROVIDER` 连 Joi schema 都已正式声明**（`config.module.ts:44` / `:41`），却在两份文件里都不存在——校验层承认其存在、供给层从未提供，是 F1「四角不对拍」最省力的复现样本。

**F5 · 同一键的默认语义在样例与代码之间相反**

- `.env.example:111` `EVENT_STORE_ENABLED=false`，但 `envs/development.ts` 写 `(process.env.EVENT_STORE_ENABLED ?? 'true') === 'true'`，而 `envs/default.ts` 写 `process.env.EVENT_STORE_ENABLED === 'true'` ⇒ **删掉该行不写时，dev 直接默认开启 ES 影子追加**（与「显式 false」的样例意图相反，且与 `default.ts` 的兜底方向相反）；开关的前提还是「目标库已 apply 0009 event 表，误开即 append fail-loud」。
- `.env.example:112` `PLATFORM_OPERATOR_EMAIL=admin@example.com` 与代码兜底值**字面相同** ⇒ 漏配时看不出任何异常，平台治理面「谁是经营者」这件事在样例与默认里互相掩盖。

**F6 · D4 只封住了 compose 通道，非 compose 部署仍以文件为唯一源**

D4 落地后，编排里 `DATA_RESIDENCY_ENFORCE=true` 使挂载文件覆不动该键——但**直接 `node dist/apps/api/src/main.js` 起服（本文档自身的部署路径之一）没有编排注入**，此时 `.env.example:18` 那行 `# DATA_RESIDENCY_ENFORCE=`（注释态·无说明文字）仍是「解注释即可把生产 strict 降为 warn」的通道。本片只负责把**样例文案的口径**补成「仅限非生产临时降级 + 生产严禁」，不改运行时语义（是否让逃生阀在非生产之外彻底失效属策略面·归人）。

**F7 · 文档路径口径漂移（承 `module-deploy-host-residency` §5 缓行项）**

- `docs/specs/architecture.md:10/:64` 与 `docs/specs/architecture-zh.md:8/:62` 仍写 `src/modules/<context>` / `src/modules/users/domain/**`；**实仓为 `apps/api/src/...` + `libs/core/src/...`**（`ls` 本轮坐实）。
- `docs/oauth-guide-en.md:85` 让用户「Update your configuration in `src/config/envs/default.ts`」，实际路径 `apps/api/src/config/envs/default.ts`（与 F3 直接相关：照文档改不到那个文件就补不上 google 槽位）。
- `AGENTS.md` §5 目录地图**已合规**（line 43 已写成 `libs/core/src` + `apps/api/src` 双包口径）——本轮初始把它当成漂移面，是取自 agent 上下文里的**旧快照**，直查磁盘后推翻（本身即「AI 上下文 ≠ 仓库实况」的一个现场样本，故不记为待修项）。
- 前片 `module-deploy-host-residency.md:88` 记的「`envs/.env.development` 分层」漂移：**AGENTS.md / `docs/specs/*` 已零命中**，仅 `.qoder/repowiki/` 三份自动生成卡仍如此描述（生成物·非人维手的 SSOT）⇒ 该缓行项在仓库维护面已闭合。
- 次生危害：新人 / Agent 照文档路径改配置会改到不存在的位置（文档是 L4 入口，AGENTS.md 自称「当前真相的指针」）。

**F8 · 三条旧挂账经人工二次核验已在现 HEAD 闭合（据实销账·零动作）**（AGENTS §2「静态分析结论必须二次人工核验」）

- 候选①「`StorageService.uploadFile` 无调用方」：**已不存在**——全仓 `uploadFile` 仅见于 `providers/storage.interface.ts`（+三 provider 实现·`uploadFileFromStream` 被 `storage.service.ts:78` 调用）与 `controllers/storage.controller.ts:43` 同名路由方法。经比对 `global-tenancy.md:242`：门面已于 2026-10-14 [module-tenancy-quota-member-wiring](./module-tenancy-quota-member-wiring.md) 人签删除——**挂账当时已结，本轮重启引擎后把它当开放项属陈旧重读**。
- 候选②「`TenantStatus` / `PlatformUserRow` re-export 冗余」：各自**唯一定义**（`libs/core/src/tenancy/lifecycle/tenant-lifecycle.ts:15`、`apps/api/src/modules/tenants/domain/repositories/user-governance.repository.ts:16`），26 处导入均走 `@core/saas-kit/...` 值导入，未见重复导出点；`global-tenancy.md:242` 已自记「陈旧重报·就此销账」。
- 候选③「`/health` 依赖外网 IP 查询（`external-ip-check`）」（host-residency §5 首条缓行项）：**该依赖已不存在**——`apps/api/src/common/health/health.controller.ts` 为 **ping-only**（`this.health.check([])` 空指示器数组），全仓 `grep -ri "external-ip\|ipify\|checkip"` 零命中⇒ 探针不再受容器 DNS 影响，缓行项自然结清（readiness 仍按原注释「丁项缓行」）。
⇒ 三项**均无需任何删除/修改动作**，本片只做销账与交叉回写（不动任何代码·不动高危面）。

## 2. 方案（切片，含必须归人的权衡点）

**切片 A · F3 的取舍（两案互斥·不替人裁）**

- **A-1 兑现承诺**：`envs/default.ts` 的 `oauth.secrets` 补 `google: { clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '' }` 槽位 ⇒ 四处宪法承诺与 `oauth-guide-en.md` 立刻成立。触面：应用配置面（**非高危**）。
- **A-2 撤回承诺**：删 `.env`/`.env.example` 的 `GOOGLE_*` 两键，并把 `vision.md` / `tooling-standards.md` §2.1 / `glossary.md` / `README.md` 四处「保留 Google」改实。**触 `docs/specs` 宪法 = 高危，须人签核。**
- **两案共同底线（本片的机制修·必做）**：`buildSocialProviders()` 的 `continue` 必须**可见化**——对「已声明启用却无 secrets 槽位 / 有槽位但无凭证」两种情形分别打明确 warn（或按人裁改为非生产 warn + 生产 fail-loud）。否则同类「文档教了、代码没接」的缺陷还会再犯（机制修复不逐 provider 特判）。

**切片 B · 样例↔代码对齐（`.env.example` 为唯一落点·非高危但须人过目）**
F4 的 6 个应用/守卫面键上样例（`AUTH_TRUSTED_PROXIES` / `DATA_RESIDENCY_ENFORCE` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` / `LOG_LEVEL` / `LOG_FILE` / `PAYMENT_PROVIDER`，各带一行「未配的后果」注释）；F5 两处语义写明或统一（`EVENT_STORE_ENABLED` 建议 dev 兜底由 `'true'` 改回 `'false'` 或样例显式保留 + 注释说明「不写=开」，二择一·归人）；F6 把 `# DATA_RESIDENCY_ENFORCE=` 补成「仅非生产临时降级；生产严禁·compose 已钉 true」。
**不动**开发机 `.env`（含 `DATADOG_*` 残留·机器侧文件归人）。

**切片 C · 门禁化（可选·高危「新增门禁面」须签核）**
`scripts/verify-config-contract.ts`（与 `verify-compose-contract.ts` 同构·独立 script·**不进 `ci` 链**）三判据：① 样例键 ⊆（Joi schema 键 ∪ 代码实际读取键）→ 无死配置；② 代码读取键 ⊆（样例 ∪ 显式白名单）→ 无隐藏必需项；③ Joi `.required()` 键全部出现在 `docker-compose.yml` 的 `environment` → 承接 D4 已闭合的判据不回潮。
代价：白名单需要人维护；F3 的静默跳过属运行期语义，静态脚本抓不到（故 A 的 warn 化不能被 C 替代）。

**切片 D · F7 路径口径归零（触 `docs/specs` 宪法 = 高危·须签核）**
`architecture.md:10/:64` / `architecture-zh.md:8/:62` / `oauth-guide-en.md:85` 的 `src/…` 统一为 `apps/api/src/…` + `libs/core/src/…`（`AGENTS.md` §5 已合规·不动）；只改口径不改结构（不做目录再搬迁）。`.qoder/repowiki/` 属生成物，如要订正应走重生流程而非手改（`[ ]` 开工前与人确认）。

**缓行 / 另案（不在本片并案）**：compose 把 `5432` 连同弱口令 `postgres/postgres` 发布到宿主（安全面·范围独立）；`DATA_RESIDENCY_ENFORCE` 逃生阀是否应在非编排部署路径也彻底移除（策略面·归人）；F8 三项已销账、不再列。

## 3. 影响面与风险

- **F3 是「静默不可用」而非「不可启动」**：它不会让任何现有测试或门禁变红，故**只修 warn 不修槽位**（A-1 的半边）会让人继续误信文档；反之**只补槽位不加 warn**，下一个未接的 provider（facebook/twitter/…枚举里还有 8 个）仍会同样静默。二者须同做。
- **A-1 与 A-2 是承诺方向之争**（要不要在模板里对外提供 Google），**归人**；本片不预设。`vision.md` 把 Google/GitHub 列为「境内约束的例外保留」，若走 A-2 即修宪，须与当初 D8 排序一并复核。
- 改 `.env.example` 会影响**新克隆者的第一份配置**：新增键必须给安全默认（注释态或空值 + 说明），**不得写入任何真实凭证**；`OAUTH_*` 类键的默认值变化可能改变本地登录面行为（`[ ]` 落地前复核 seed/e2e 是否依赖现值）。
- 切片 C 属门禁面（AGENTS §2 高危），且判据①/② 依赖「代码读取键集合」的解析口径——**必须复用与本轮相同的 `process.env` + `ConfigService.get('K')` 双模式扫描**，否则重演 fallow 型假阳性（F8 正是反例：门面方法已不存在却仍挂在账上）。
- 切片 D 触宪法与 L4 入口文件，属人签核项；本片**只提议、不改写**。
- 可逆性：各切片独立成 commit，无数据面、无迁移。

## 4. 取证计划（判据的执行口径）

1. **四角对拍存照**：把本轮的比对脚本口径固化并输出四组集合（仅真实有 / 仅样例有 / 代码读两文件皆无 / 文件有两代码不读），作为 F1–F4 的**可复核存照**（切片 B/C 的基线）。
2. **F3 双向实证**：落地前——`OAUTH_PROVIDERS=github,google` + 填 `GOOGLE_CLIENT_ID/SECRET` 起产物服，断言 `auth.service` 暴露的 provider 列表**不含 google** 且日志零线索（存照「静默」）；落地后（A-1 + warn）——同一输入下 google 出现在列表中，或（故意不填凭证）日志给出可定位的 warn。A-2 则改为「文档/样例/代码三处均不再出现 google」的 grep 存照。
3. **回归**：`pnpm run ci` 基线 **346（330/16）** 零掉；`verify:prod-boot` /health 200；若批准切片 C，则新增脚本正跑 PASSED + **人造违规 ×3**（样例塞死键 / 代码读键不上样例 / required 键不上编排）各非零退出。
4. **样例可用性**：以 `cp .env.example .env` 的洁净夹具跑一次 `docker compose config` 与产物起服冒烟，证明样例本身不缺口（合成假密钥·验毕清零）。

## 5. 完成判据（可核验 + 穷尽）

- [ ] F3 定性闭合：Google 渠道走 A-1 或 A-2 之一（人裁），且 `buildSocialProviders` 的静默跳过已可见化（warn/fail-loud·二择由人裁）
- [ ] F1/F2/F4 四角对拍集合已存照，且（若批准切片 C）由 `verify-config-contract` 持有
- [ ] F4 的 6 个应用/守卫面键已在样例成文并带「未配后果」注释；F5 两处默认语义矛盾已消（写明或统一）
- [ ] F6 样例的 `DATA_RESIDENCY_ENFORCE` 注释文案已改口径（生产严禁·compose 已钉 true）
- [ ] F7 路径口径在 `architecture.md` + `architecture-zh.md` / `oauth-guide-en.md` 归零（`AGENTS.md` §5 已合规无需动），且无残留 `src/modules` 式旧口径
- [ ] F8 三条旧挂账的销账结论已交叉回写 `global-tenancy` §10 与 `module-deploy-host-residency` §5（不动任何代码）
- [ ] `pnpm run ci` 基线 **346** 零掉 + `verify:prod-boot` 200 +（若批准）`verify-config-contract` 人造违规 ×3 全非零
- [ ] 临时夹具（含密钥副本）清零·未读写开发机真实 `.env` 内容入库
- [ ] 人类验收

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-15 | 0.1.0 | 人「继续」→ 对前片遗留的缓行/挂账逐项只读勘察并立案（**零代码**） | 首版八条事实：F1 四份配置契约（`.env` 50 键 / `.env.example` 51 键 / Joi 27 键 / 消费合集 58 键）互不校验且 `allowUnknown: true` 使错位静默通过·F2 双文件分叉（仅真实有 4 个 **已移除的 DATADOG_\***、仅样例有 5 键）·**F3 本片定级依据：`vision.md:65`/`tooling-standards.md:56`/`glossary.md:40`/`README.md:43` 四处承诺「保留 Google/GitHub」+ `oauth-guide-en.md:72` 教用户写 `OAUTH_PROVIDERS=github,google`，而 `envs/default.ts` 的 `oauth.secrets` 只有 github/apple/feishu，`auth.bootstrap.ts:95` 对无槽位者 `continue` 静默跳过，`GOOGLE_CLIENT_ID/SECRET`（`.env.example:91-92`）全仓零消费方**·F4 代码读而两文件皆无的 9 键（前三者在样例里均为注释态·`AUTH_TRUSTED_PROXIES` 的 warn 已在 D4 真容器日志实测）·F5 同键默认语义相反（样例 `EVENT_STORE_ENABLED=false` vs `development.ts` 的 `?? 'true'` ⇒ 不写即开；`PLATFORM_OPERATOR_EMAIL` 与兜底字面相同互相掩盖）·F6 D4 只封 compose，非编排路径仍以文件为唯一源（`.env.example:18` 注释态逃生阀无说明）·F7 `architecture.md:10/:64` + `architecture-zh.md:8/:62` + `oauth-guide-en.md:85` 仍用 `src/…` 旧路径（实为 `apps/api/src` + `libs/core/src`）；**AGENTS.md §5 已合规**（本轮初判取自 agent 旧快照、直查磁盘后推翻）；`envs/.env.development` 漂移在 AGENTS/specs 零命中、仅 `.qoder/repowiki/` 生成物残留·**F8 经人工二次核验销账三条旧账**（`StorageService.uploadFile` 门面已于 2026-10-14 quota-member-wiring 人签删·`global-tenancy.md:242` 已自记；`TenantStatus`/`PlatformUserRow` 各唯一定义、26 处统一 `@core/saas-kit` 值导入；`/health` 已为 ping-only `check([])`、`external-ip-check` 全仓零命中→host-residency §5 首条缓行自然结清）。方案：切片 A（A-1 补 google 槽位 / A-2 撤承诺·**互斥归人**·共同底线是静默跳过必须可见化）／B 样例↔代码对齐（`.env.example` 单点）／C 门禁化 `verify-config-contract`（高危·可选·判据三条含承接 D4）／D 文档路径口径归零（触宪法·高危）；另案：compose `5432` 对外发布、逃生阀在非编排路径是否彻底移除（策略面） |

---

<!-- 变更戳 -->
正文已于 2026-10-15 / v0.1.0 变更（首版·零代码只读勘察立案·待审计门），以当前正文内容为准。
