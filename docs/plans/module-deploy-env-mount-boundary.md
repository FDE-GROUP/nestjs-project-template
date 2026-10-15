# 部署面 env 供给边界：compose 挂载宿主 `.env` 使生产合规结论系于未追踪文件（D4 收口）

> 适用范围: `部署面(docker-compose.yml + scripts/verify-compose-contract.ts + docs/docker-deployment.md)` ← blast radius：**不触业务代码 / 不触 DB schema / 不触 CI 门禁链**（切片 B 若批准才延伸既有门禁；是否触 `docker-compose.yml` 由人签核决定）
> 关联: `specs/tooling-standards.md` §4.10（部署声明对拍）· `plans/module-deploy-host-residency.md` §4.1（本案由其镜像层对拍**副产 D4** 立项）· 同型先例 **D1/D2/D3**（出厂部署契约内部自相矛盾 / 文档失实）
> 性质: 缺陷收口（部署契约的供给面完整性），机制单点修、不逐处特判
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**缘起**：`module-deploy-host-residency` §4.1 做 compose 全图 strict 实跑时，为了不给生产图喂开发机文件，把挂载源临时换成了 `.env.example` 的合规副本；换回本机真实 `.env`（storage 段是 `s3/us-east-1`）后，**同一张图、同一个镜像**改为以 `storage region "us-east-1" for provider "s3" is outside mainland allowlist` 拒启。当时据实登记为 D4「出厂 compose 的 `./.env:/app/.env` 挂载把生产容器驻留结论系于未追踪的开发机文件」，并明确「另案」。本案即该另案的立案勘察。

### 事实（六条，均为配置/代码事实或本轮实跑，非推测）

**F1 · 挂载是 load-bearing，不能一删了之**

| 环节 | 事实 |
|------|------|
| `docker-compose.yml:29` | `- ./.env:/app/.env` |
| `docker-compose.yml:12-22` | `environment` 只声明 `NODE_ENV` / `DATABASE_URL` / `PORT` / `DATA_RESIDENCY_DB_HOST_ALLOWLIST` |
| `apps/api/src/config/config.module.ts:20-31` | **8 项 `.required()`**，其中编排只供到 `DATABASE_URL` 一项 |

⇒ 余下 **7 项**（`JWT_SECRET`、`JWT_REFRESH_SECRET`、`ALLOWED_ORIGINS`、`STORAGE_REGION`、`STORAGE_ENDPOINT`、`STORAGE_ACCESS_KEY_ID`、`STORAGE_ACCESS_KEY_SECRET`）**只能来自挂载文件**：直接删除挂载 = Joi 校验拒启。任何处置都必须先回答"这 7 项从哪来"。

**F2 · 守卫的"输入事实"半边确实由图外决定**
`apps/api/src/main.ts:46-59` 交给 `assertDataResidency` 的 `databaseUrl` 与 `storage.{provider,region,endpoint,accessKeyId}` 全部取自 `ConfigService`；storage 四项未在编排声明 ⇒ 逐字读挂载的 `.env`。上一轮实跑（`module-deploy-host-residency` §4.1 · D4 登记条）已坐实：挂载源为 `.env.example` 副本（默认 `alioss/oss-cn-hangzhou`）→ 放行；挂载源换成本机真实 `.env`（`s3/us-east-1`）→ 同一张图、同一个镜像改为拒启。**"出厂 compose 能否起来"因此不是一个图能回答的问题，而是"哪台开发机"的问题。**

**F3 · 更尖锐的一面：图外文件能改「策略开关」（本案定级依据）**

源码直查（非推演）：`node_modules/@nestjs/config/dist/config.module.js:55/66/69` 均调 `assignVariablesToProcess(validatedConfig, options.override)`，而 `:166-182` 实现为

```js
const keys = override ? Object.keys(config) : Object.keys(config).filter(key => !(key in process.env));
keys.forEach(key => { process.env[key] = value; });
```

本项目 `configModuleOptions`（`apps/api/src/config/config.module.ts:55-67`）**未设 `override`，也未设 `ignoreEnvVars`** ⇒ 文件对 `process.env` 的语义是「**可补缺、不可覆有**」。结合 `main.ts:41` 直接读 `process.env.DATA_RESIDENCY_ENFORCE`：

- 挂载文件里的 `HOST=localhost` **覆不动**镜像 `ENV HOST`（已在 `process.env`）→ §4.1 已实证；
- 挂载文件里的 `DATA_RESIDENCY_ENFORCE=false` **能生效**（compose **未声明**此键 → 属"补缺"）⇒ 生产容器的 PIPL 硬闸可被开发机上一行注释（`.env.example:18` 正是这条逃生阀）静默降为 warn（只打日志、继续 boot）。

⇒ D4 不是"结论不确定"的描述性问题，而是**逃生阀在图外**：一行未追踪文件即可关闸。`[ ] 运行时取证列 §5`（源码已证，但按纪律补一次真容器 A/B）。

**F4 · 静态门禁按设计看不见图外半边**
`scripts/verify-compose-contract.ts` 只解析 `docker-compose.yml` + `Dockerfile` 文本，判据覆盖镜像监听默认、DB 主机在 strict 下合规、compose 未声明 `ENFORCE=false`——**对"storage 事实由图外文件提供"无可断言**。即当前绿门并不保证部署合规性来自编排自身。

**F5 · compose 的插值源本来就是宿主 `./.env`（关键机制，已实测）**

```yaml
environment:
  - FOO=${JWT_SECRET:?JWT_SECRET must come from deployment env}
```

同目录放一份 `.env` → `docker compose config` 渲染出 `FOO: from-host-dotenv`（退出码 0）；变量缺失 → `error while interpolating …: required variable JWT_SECRET is missing a value`，**退出码 1、`up` 之前就失败**。⇒ 改用插值**不引入新文件、不新增密钥副本**，只是把"图外暗供给"搬到"图上明声明"，并顺带获得 fail-fast。

**F6 · 样例文件与真实文件已经分叉（旁证，量级另案）**
本机 `.env` 有 `DATADOG_*`（4 项）而 `.env.example` 无；`.env.example` 有 `EVENT_STORE_ENABLED` / `FEISHU_*` / `STRIPE_*` / `OAUTH_GENERIC_PROVIDERS` 而本机无。⇒ "以样例合规推生产合规"不成立（这也订正了 D3 收口时那句"样例默认本就合规"的适用边界：样例合规 ≠ 生产合规）。

## 2. 方案（切片，含必须归人的权衡点）

**切片 A · 编排层把 7 项 required 与 storage 事实显性化**——三个互斥变体，**不替人裁**：

- **A0（最小机制修·推荐首选）在编排层钉死策略开关**：compose `environment` 显式加一行 `- DATA_RESIDENCY_ENFORCE=true`。利用 F3 的「不可覆有」语义，开发机文件里的 `=false` 从此失效（已在 `process.env` 且值为 `true`），strict 不再可被图外按入；`resolveEnforceMode('production','true')` 返 strict。**不删挂载、不改代码、一行改动**，且可被切片 B 断言。代价：该图失去本地临时降级能力（要降级应另开 override 文件，而非静默改开发机 `.env`——这正是应要的行为）。
- **A1 `env_file:`**：去掉 bind mount，改 compose `env_file: [.env]`。挂载消失、`docker compose config` 可见、可在 up 前校存在。注：与现状在“文件能否影响策略开关”上**语义等价**（`environment:` 仍胜过 `env_file`），故 A1 **不是**安全修复，只是供给面显性化；必须与 A0 配套，否则单做 A1 仍留着图外关闸通道。
- **A2 显式插值 `${VAR:?}`**：只对 F1 的 7 项 required + F2 的 storage 事实写插值，其余不动。fail-fast（F5 实测退出码 1）、编排可见、切片 B 可断言；**代价**是 `docker compose config` 会把密钥渲染进明文输出（与 bind mount 同等暴露面，需据实说明）。前置待验：容器内不再有 `/app/.env` 时 `ConfigModule.forRoot({envFilePath:'.env'})` 是否容忍缺失（`[ ] 待实测`）。
- **A3 仅文档**：不改结构，在 `docker-deployment.md` 把"出厂图依赖宿主 `.env`、生产须替换 env 来源"写成已知限制（把 D4 降级为文档承诺，风险留在使用方——鉴于 F3 可关闸，**不推荐**）。

**切片 B · 门禁延伸（可选，依赖 A 的取舍）**：`verify:compose-contract.ts` 增加一条判据——**影响驻留判定的输入（storage provider/region/endpoint 与 DB 主机）必须在编排层可见**（显式声明或插值占位），否则 FAIL；使 F4 的盲区闭合在 CI 之前而非运行时。
**切片 C · 另案**：`.env` / `.env.example` 键位对齐（F6），触文档与样例面，建议独立小片。

**缓行 / 另案**：生产改用 compose `secrets` 或外部注入（范围明显更大，本阶段不并案）；`DATA_RESIDENCY_ENFORCE` 逃生阀是否应仅限非生产（属策略面，归人）。

## 3. 影响面与风险

- 挂载语义牵动 **mailer / stripe / oauth / datadog** 等所有从 `.env` 读取的项：A1/A2 若漏配键位，症状从"起不来"变成"起来但行为错"，必须以 `docker compose config` 渲染 + 容器内实读双向对拍。
- **最大当前风险是 F3（图外一行关闸）**，而非供给面不优雅：A0 是本片的下限要求；若只做 A1/A2 不做 A0，关闸通道仍在。
- 触 `docker-compose.yml` 属高危面（workflow §3）→ 实现前须人签核；本片本身**零代码**。

## 4. 取证计划（判据的执行口径）

1. 真容器 A/B（对 F2/F3 运行时取证）：同一镜像、同一张图，只换挂载源——（a）合规副本→放行；（b）非合规 storage 事实→拒启；（c）非合规 + `DATA_RESIDENCY_ENFORCE=false`→当前应仅 warn 并 boot（即图外关闸坐实）；（d）采纳 A0 后重复 (c) →应仍 strict 拒启。
2. 所选变体的 fail-fast 实证：缺 required 变量时 `docker compose config`/`up` 退出码非零并给出可读错误（F5 已实测手法，落到本图复跑）。
3. 变体落地后正/负向：正向全图 `Up (healthy)` + 宿主 `/api/v1/health` 200；负向把 storage 事实改非境内 → 拒启（证明合规结论已回到编排自身）。
4. 回归：`pnpm run verify:compose-contract` 仍绿、`pnpm run ci` 基线 **346（330/16）** 零掉、`pnpm run verify:prod-boot` 200。

## 5. 完成判据（可核验 + 穷尽）

- [ ] F2/F3 已用**真容器 A/B** 取证（(a)-(d) 四态），结论回填本文
- [ ] 切片 A 变体由人签核（A0 作为下限要求；A1/A2/A3 至少选一）
- [ ] 编排层已可见地提供 F1 的 7 项 required 与 F2 的 storage 事实（或经签核明确选择 A3 并在文档写成限制）
- [ ] 缺变量 fail-fast 实证退出码非零
- [ ] 正向 `Up (healthy)` + `/api/v1/health` 200；负向非境内 storage 拒启
- [ ] 若批准切片 B：门禁人造违规 EXIT≠0 一次，还原后 md5 一致
- [ ] 采纳 A0 后：挂载含 `DATA_RESIDENCY_ENFORCE=false` 的 `.env` 仍为 strict（图外关闸通道关闭）
- [ ] `verify:compose-contract` 绿 + `ci` 基线 346 零掉 + `verify:prod-boot` 200
- [ ] 人类验收

## 6. 演变

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-15 | 0.1.0 | `module-deploy-host-residency` §4.1 副产 D4 依约另案立案 | 首版（零代码·只读勘察 + 多项实测）：F1 挂载 load-bearing（7 项 required 只由图外文件供）·F2 守卫输入事实半边在图外（上轮实跑已证）·**F3 经源码直查推翻初判方向**（`config.module.js:166-182` 在 `override` 为假时把「不存在于 `process.env`」的键回填 ⇒ 图外一行 `DATA_RESIDENCY_ENFORCE=false` 即可把生产 strict 静默降为 warn · D4 由「结论不确定」升级为「逃生阀在图外」）·F4 静态门禁盲区·**F5 compose 插值源即宿主 `./.env`（实测：渲染成功 / 缺变量退出码 1）⇒ 改插值不引入新文件**·F6 `.env` 与样例已分叉（订正「样例合规≠生产合规」）；方案新增 **A0（编排层钉死 `DATA_RESIDENCY_ENFORCE=true`·一行·下限要求）**并把 A1 从「安全修复」降为「仅显性化」；切片 B 门禁延伸可选，切片 C 键位对齐另案 |

---

<!-- 变更戳 -->
正文已于 2026-10-15 / v0.1.0 变更（D4 另案立案·零代码勘察），以当前正文内容为准。
