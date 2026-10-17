# 配置面两待裁点落地：seed 弱口令兜底「生产 fail-loud + 非生产 warn」+ 四角对拍独立 verify 脚本

> 适用范围: `模块(config + database/seed + scripts 独立门禁)` ← = blast radius：seed 行为变更（只影响 `NODE_ENV=production` 路径·零 DB schema）+ 新增独立静态脚本（不进 `ci` 链）+ `.env.example` Seed 段文案
> 关联: [module-config-env-surface-contract](./module-config-env-surface-contract.md)（本片执行其「缓行 / 另案」两条的**人裁结果**：弱口令兜底 + 切片 C）· `specs/tooling-standards.md` §4.7（静态分析须人工核验）· §4.10（对拍口径）· `AGENTS.md` §2（高危归人）
> 性质: 缺陷收口（配置供给面遗留的两处「声明有防线、实现无持有」闭合）·机制单点修、不逐键特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

config 片（module-config-env-surface-contract·已验收·结项 v0.3）把两项缺陷查到底但按纪律**未自裁**，登记归人；2026-10-17 人经 AskUserQuestion 双问拍板：

- **裁点一（seed 弱口令兜底）**：选「生产 fail-loud + 非生产 warn」——`NODE_ENV=production` 且缺 `ADMIN_PASSWORD` / `USER_PASSWORD` 即**拒跑**（平台经营者账号 `admin123` 零弱口令上生产）；非生产保留兜底 + **点名 warn**。与本 plan 切片 A-1 已落地的 OAuth social 面「非生产 warn / 生产 fail-loud」**完全同构**（机制不特判）。
- **裁点二（四角对拍门禁化）**：选「独立 verify 脚本」——落 `scripts/verify-config-contract.ts`（与 `verify-compose-contract` / `verify-prod-boot` / `verify-i18n-assets` 同构·**不进 `ci` 链**·零门禁行为变更）。

**非目标（明确不做，均留 config 片缓行清单继续挂账）**：compose `5432` + `postgres/postgres` 弱口令发布宿主；`DATA_RESIDENCY_ENFORCE` 逃生阀在非编排路径彻底移除；generic OAuth 面升级生产 fail-loud。

## 2. 方案（切片）

### 切片 E · seed 面 fail-loud（裁点一）

- `apps/api/src/database/seed.ts`：入口裁决单点（不逐处特判）——`NODE_ENV=production` 且（缺 `ADMIN_PASSWORD` 或缺 `USER_PASSWORD`）→ throw 拒跑，错误文案点名两键与后果（平台经营者口令不得静默内置）；非生产行为逐字不变 + 在 seed 日志头部补一条点名 warn（两键未配 → 使用内置 `admin123` / `user123`）。
- `.env.example` Seed 段：三键现均注释态（v0.2.2 上图）；本切片只把后果文案更新为「**生产环境缺 `ADMIN_PASSWORD`/`USER_PASSWORD` 将拒跑 seed**」（键集合不变·仍不写入任何真实凭证）。
- 锁测（`seed.test.ts` 旁挂或并入）：① 生产缺键 → reject/throw 且文案点名；② 生产配齐（合成假值）→ 不 throw·hash 用注入值；③ 非生产缺键 → 兜底现值不变 + warn 恰一条。
- 完成判据：三例锁测绿 + `NODE_ENV=production pnpm run db:seed`（缺键）真实拒跑复现（**取证姿势见 §4**，不真写库）。

### 切片 F · verify-config-contract.ts（裁点二·plan 切片 C 既有设计执行）

三判据（全部**静态声明面**校验，与 compose 门禁互补不互替）：

1. 样例生效键 ⊆（Joi schema 键 ∪ 代码读取键）→ 无死配置；
2. 代码读取键 ⊆（样例 ∪ 显式白名单）→ 无隐藏必需项（白名单初始集 = config 片 §4.6 已甄别的 `scripts/` 面三键等刻意不上图项）；
3. Joi `.required()` 键全部出现在 `docker-compose.yml` 的 `environment` → 承接 D4 已闭合判据不回潮。

口径硬约束（config 片 §1 口径教训的制度化）：代码读取集必须 **`process.env.K` 与 `configService.get('K')` 双模式扫描**（否则重演 MAIL_* 型假阳性与 F8 型陈旧账）；扫描范围钉死 `apps/**` + `libs/**` + `scripts/**`（排除 `*.test.ts`）；判定尽量**复用产物**（dist 的 envs / Joi schema）而非另写第二套解析，防门禁与真相漂移。脚本输出四组集合（仅真实有 / 仅样例有 / 代码读两文件皆无 / 文件有两代码不读）作为可复核存照。

- 落点：`scripts/verify-config-contract.ts` + `package.json` scripts 增 `verify:config-contract`（**独立命令·`scripts/ci.ts` 零改动**）。
- 完成判据：正跑 PASSED + 人造违规 ×3（样例塞死键 / 代码读键不上样例 / required 键不上编排）各 EXIT=1，验毕还原。

## 3. 影响面与风险

- **高危触达**：改 seed 行为（数据面脚本）+ 新增门禁面脚本（不进链故不改变 L1 语义）→ **本 plan 须人签核后方可实施**（`AGENTS.md` §2）；`.env.example` 触配置供给面（只改文案不改键集合）。
- **可逆性**：两切片各自独立成 commit、零迁移、可逐片 revert；seed 生产拒跑只影响「以 production 口径跑 seed」的路径（现有部署文档未以此跑 seed·实施前复核 `install&run.md` / `docs/docker-deployment.md` 无该用法，若有则文档同步）。
- **风险**：切片 F 的静态解析存在假阳性面（反射/动态键）→ 白名单机制兜底 + 首轮以 config 片 §4.6 已核集合对拍校准；锁测新增例数归人裁（默认 +3 只增不减）。

## 4. 取证计划

1. 切片 E：`seed.test.ts` 三例进 Vitest 基线；生产缺键拒跑用 **env 注入 + 桩/早退**或 scratch 库复现（**禁真写开发机库**·config 片已登记「跑 db:seed 取证属高危」，本轮取证不得违反）；非生产现流程回归（`ci:db` 夹具若依赖兜底值 → 零影响证明）。
2. 切片 F：正跑存照 + 人造违规 ×3 非零退出 + 四组集合与 config 片 §4.6 存照一致性核对。
3. 门禁：`pnpm run ci` 全绿·基线只增不减；Biome 净。

## 5. 完成判据（可核验 + 穷尽）

- [ ] 切片 E：生产缺两键拒跑有真实存照；非生产行为与文案逐点落地；三例锁测绿
- [ ] 切片 F：脚本三判据 + 双模式口径落地；正跑 PASSED + 人造违规 ×3 EXIT=1；`ci.ts` 零改动坐实
- [ ] `.env.example` 键集合不变（diff 坐实仅注释文案行变更）
- [ ] `pnpm run ci` 全绿（基线 ≥483 只增不减）+ Biome 净
- [ ] README 索引 + 本 plan 演变对账，人类验收后结项

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人裁「2」→ AskUserQuestion 双问定档（生产 fail-loud + 非生产 warn / 独立 verify 脚本）后依「无已审方案不写码」起草 | 首版（零代码·只提议）：切片 E seed 裁决单点 + 切片 F 三判据静态脚本（承 config 片切片 C 既有设计与口径教训）；三条非目标继续挂账显式排除 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 变更（起草·待人类审计签核），以当前正文内容为准。
