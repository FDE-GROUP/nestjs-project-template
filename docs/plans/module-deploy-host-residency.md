# 部署契约自洽性：容器监听默认 · 驻留守卫逃生阀 · 文档失实订正

> 适用范围: `部署面(Dockerfile + docker-compose.yml + docs/specs/tooling-standards.md + docs/docker-deployment.md)` ← blast radius：**不触业务代码 / 不触 DB schema / 不触 CI 门禁链**（切片 D 若批准才新增门禁）
> 关联: `specs/tooling-standards.md` §4.10（部署声明对拍·本案三条纪律全部落在此节）· `plans/global-runtime-node-pnpm.md` §4.9.1 / §4.12（本案由其 compose 补验手法与残留观察立项）· `plans/module-i18n-assets-resolution.md` §4.2（本案由其镜像层对拍副产观察立项）· 同型先例 **R-θ / R-κ**（声明有、实现无；镜像内留死面）
> 性质: 缺陷修复（机制单点修，不逐处特判）+ 一处文档失实订正
> 状态**不在此**：审计 / 执行状态单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**缘起**：`module-i18n-assets-resolution` §4.2 做镜像层重建对拍时，裸 `docker run` 打发布端口恒返回 502；同轮又遇 PIPL 驻留守卫拒绝容器名 DB 主机。当时把两者都登记为「非本片范围的观察」，本轮立案收口。**立案勘察后结论升级**：两条都不是「使用姿势问题」，而是**出厂部署契约内部自相矛盾**，并额外查出第三处文档失实。

### 三条缺陷（均代码/配置事实，非推测）

**D1 · 镜像无容器语义的监听默认 → 裸 `docker run` 必 502**

| 环节 | 事实 |
|------|------|
| `apps/api/src/config/config.module.ts:15` | `HOST: Joi.string().default('localhost')` |
| `apps/api/src/main.ts:148` | `await app.listen(port ?? 7009, host ?? 'localhost')` |
| `Dockerfile` runner 段 | 只 `ENV NODE_ENV=production`，**无 `HOST`**（`grep -nE '^(ENV\|CMD\|HEALTHCHECK)' Dockerfile` 存照） |
| `docker-compose.yml:16` | `HOST=0.0.0.0`（**compose 面恰好把它掩盖了**） |

⇒ 产物镜像内进程只绑回环，`-p` 发布端口无进程监听，返回的是 **Docker 代理的 502**（`Content-Length: 0`、应用日志零请求记录）。本轮实机坐实：加 `-e HOST=0.0.0.0` 后请求才进应用。
**加重项**：`tooling-standards.md` §4.10 把验收口径**成文**为「`docker build` EXIT=0 → **`docker run` 真起服命中 `/api/v1/health` 200** → `docker inspect … healthy` → compose 全图」——**宪法自己规定的裸 `docker run` 这一步按当前镜像必失败**，任何照宪法执行的人都会踩。

**D2 · 出厂 compose 图与驻留守卫互斥 → strict 下永远拒绝 boot**

```yaml
# docker-compose.yml:13-14
- NODE_ENV=production                                                            # → resolveEnforceMode 返回 'strict'
- DATABASE_URL=postgres://postgres:postgres@postgres:5432/nestjs_practice        # host = 裸容器名 "postgres"
```

`apps/api/src/config/data-residency.ts:37-47` 的 `MAINLAND_DB_HOST_PATTERNS` 只含 `localhost` / `127.x` / `10.x` / `172.16-31.x` / `192.168.x` / `.cn` TLD / 阿里云 / 腾讯云形态——**不含任何裸服务名**。⇒ **无论 storage 配得多合规，出厂 compose 全图在 strict 下必抛 `DATABASE_URL host "postgres" is outside mainland allowlist`**。

逃生阀其实**早已实现且已写进模板**，只是没在编排接线：
- `main.ts:42` `DATA_RESIDENCY_DB_HOST_ALLOWLIST`（逗号分隔窄放行）
- `.env.example:19-20` 有该开关的成文示例
- `docker-compose.yml` **未设**（`grep` 确认）

**上一轮的「补验」是绕过而非修复**：`global-runtime-node-pnpm.md:176` 自陈 compose 全图 `Up (healthy)` 是靠临时覆盖 `DATA_RESIDENCY_ENFORCE=false` 跑通的，且当时写「主 compose 文件与 fail-closed 默认未动」。以**关掉整个合规守卫**换取部署可用，与 §4.10「不留跑不通的死面 / 不加看起来能用的兼容配置」的精神相反——正确解是用**窄白名单**放行图内 DB 主机，守卫其余部分继续生效。

**D3 · `docker-deployment.md:116` 把失败原因归给了模板里不存在的默认值**

文档原文称：「The placeholder `.env` shipped with the template (`STORAGE_PROVIDER=s3`, `STORAGE_REGION=us-east-1`, `s3.us-east-1.amazonaws.com`) therefore makes `docker compose up -d` exit with `Data residency violation`」。
实据：仓库**只追踪 `.env.example`**（`git ls-files | grep '^\.env'` → 仅 `.env.example`），而其 storage 默认段是 **`alioss` + `oss-cn-hangzhou` + `oss-cn-hangzhou.aliyuncs.com`（本就境内合规）**；`s3` / `us-east-1` 只是**注释掉的备选段**（`.env.example:49-51`）。
⇒ 该句把 compose 起不来的原因归给了一个模板并不存在的默认值，**掩盖了 D2 这个必然失败的真正根因**（DB host）。按此文档排障的人会去改 storage，而改完照样起不来。

### 目标

1. 镜像自带容器语义的监听默认，使 §4.10 规定的裸 `docker run` 对拍链真能跑通（D1）。
2. 出厂 compose 图在 **strict 不关闭**的前提下可 boot：用窄白名单放行图内 DB 主机（D2）。
3. 文档与宪法口径订正到与代码事实一致，并把两条纪律成文防回归（D3 + 沉淀）。

## 2. 方案

### 切片 A · 镜像监听默认（D1）

- `Dockerfile` runner 段 `ENV NODE_ENV=production` 之后加 **`ENV HOST=0.0.0.0`**，注释写明：容器内绑回环无意义（对外边界由 `-p` / 网络策略决定），故镜像默认取容器语义；宿主开发仍由 `.env` 的 `HOST=localhost` 决定，互不影响。
- `docker-compose.yml:16` 的 `HOST=0.0.0.0` → **人已裁：删**（单一真源落 `Dockerfile`）；已登记 R-β 旧镜像兼容代价，本阶段不以双写换取向后兼容。

### 切片 B · compose 逃生阀接线（D2）

- `docker-compose.yml` app 的 `environment` 增 **`- DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres`**（只放行图内 DB 服务名，`NODE_ENV=production` 的 strict 其余检查全部保留）。
- 同处加一行注释：跨境自建部署须把它改成具体的境内 IDC/云主机名，或在确认合规后删除该放行（**不得改用 `DATA_RESIDENCY_ENFORCE=false` 作为常规手段**）。

### 切片 C · 文档与宪法成文（D3 + 防回归）

- `docs/docker-deployment.md`：
  - 订正 `:116` 的失实归因——改为「出厂 compose 的 DB 服务名不在内置境内白名单内，故编排已用 `DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres` 窄放行；若你把 storage 配成非境内 region，仍会按设计拒绝启动」，并保留「`.env.example` 默认即境内（alioss/oss-cn-hangzhou）」的正确事实。
  - Troubleshooting 补两条：① 裸 `docker run` 未设 `HOST` 时的 502 症状与成因（切片 A 落地后写「镜像已内置 `HOST=0.0.0.0`」）；② `Data residency violation` 的两种正确处置（窄白名单 vs 改主机），并明确 `DATA_RESIDENCY_ENFORCE=false` 仅限本地一次性验证。
  - 环境变量表补 `DATA_RESIDENCY_DB_HOST_ALLOWLIST`（现仅 `docker-deployment.md` 未列，`.env.example` 有）。
- `docs/specs/tooling-standards.md` §4.10 新增两条纪律（**改宪法·高危须签核**）：
  - **容器监听默认须与部署语义同源**：镜像不得依赖调用方补 `HOST` 才能对外可达（宿主默认 `localhost` 与容器要求相反时，镜像层显式覆盖）。
  - **合规/安全守卫不得以整闸关闭换取可启动**：编排内的既有互斥须用**最小逃生阀**（窄白名单/单主机放行）表达；「验证时顺手关掉守卫」不能作为该编排可用性的证据，须以守卫开启态实跑。
  - 并订正既有那条对拍口径的措辞，使裸 `docker run` 一步显式带上「按镜像默认即可对外可达」的前提。

### 切片 D · 静态一致性门禁（可选·待人裁）

- 新增 `scripts/verify-compose-contract.ts`：解析 `docker-compose.yml` + `Dockerfile`，断言①镜像层有 `HOST` 默认或 compose 已设；②compose 的 `NODE_ENV=production` 与 `DATABASE_URL` host 关系成立时，必须有对应 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 放行（复用 `data-residency.ts` 的判定函数，避免第二套白名单实现）；③编排内不得出现 `DATA_RESIDENCY_ENFORCE=false`。独立 script（与 `verify:prod-boot` / `verify:i18n-assets` 同构，**不进 `ci` 链**）。
- 立场：这类「声明互相矛盾」恰是静态门禁最该咬的（本案三条全靠人工实跑才发现）；但也可判为过度工程（实跑对拍已能覆盖）。**默认建议做**，因人裁而定。

### 缓行 / 另案（不在本片）

- **`/health` 依赖外网 IP 查询**：`external-ip-check` 使存活探针受容器 DNS 影响（本轮就因它拿过一次假阴性 502）。属探针设计问题，另案评估（不宜与本案混做，因其需改健康检查契约面）。
- **D4 · compose 把宿主 `.env` 整份挂载进生产容器**（§4.1 实证：本机 `.env` 的 `s3/us-east-1` 使同一张图以 storage 理由拒启）：生产容器的驻留结论系于未被追踪的开发机文件，须另案决定「关键项显式入 `environment`」还是「文档写明挂载 `.env` 必须自身合规」。→ **已立案** [`module-deploy-env-mount-boundary.md`](./module-deploy-env-mount-boundary.md)（该案勘察后定级升级：挂载不仅是“结论不确定”，而是图外一行即可关闸；且因 8 项 Joi required 中编排只供到 1 项，挂载属 load-bearing不可直删）。
- `compose` 把 `5432:5432` 暴露到宿主（DB 端口对外），安全默认问题，另案。
- `AGENTS.md` §3 / repowiki 仍称 `envs/.env.development` 分层，实仓为根 `.env`——文档漂移另单归零。

## 3. 影响面与风险

| 风险 | 说明 | 缓解 |
|------|------|------|
| **R-α** 默认监听面扩大 | `ENV HOST=0.0.0.0` 使镜像在无 env 时也绑所有网卡 | 容器内绑回环不具防护价值（边界由端口发布/网络策略决定）；文档写明；宿主开发路径不受影响（`.env` 优先） |
| **R-β** 双源 vs 单一真源 | 切片 A 后 compose 的 `HOST=0.0.0.0` 变冗余 | 人裁：保留（对旧镜像向后兼容 + 显式）或删（单一真源）；两种都不影响判据 |
| **R-γ** 窄放行被误用 | `DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres` 若被照搬到境外同名主机 | 守卫是「主机名字符集」判定，本就无法鉴别同名异地；靠注释 + 文档写明跨境须改具体主机，并在 D2 文档口径中点名 |
| **R-δ** 实跑成本高 | 判据要求「compose 全图 **strict 态**」实跑，而本机 Docker VM DNS 污染（本轮已复现） | 走已验证的绕行手法（buildkit `--dns` + `docker import` / 临时网络）；对拍需给 app 容器 `--dns`，否则 `external-ip-check` 面会给出假阴性 502（见缓行项） |
| **R-ε** 高危面密集 | 触 `Dockerfile` / `docker-compose.yml` / `docs/specs` 宪法 | 全部属 AGENTS §2 人签核项，未签核不动；改动后按 §4.10 实跑存照 |

**不涉及**：DB schema / 迁移 / 业务代码 / 测试基线（除切片 D 新增 script）/ CI 门禁链顺序。

## 4. 审计记录

- **已审计**（人 2026-10-15 三问定档）：① 切片范围 = **A+B+C+D 全做**（高危面一并签核：`Dockerfile` / `docker-compose.yml` / `docs/specs` 宪法）；② `docker-compose.yml` 的 `HOST=0.0.0.0` = **删**（R-β 取单一真源，不取双写兼容）；③ plan 文档 = **不单独提交**，随实现同 commit（与兄弟片先例一致）。
- 立案依据均为**只读勘察 + 实机存照**：`Dockerfile` / `docker-compose.yml` / `.env.example` / `config.module.ts:15` / `main.ts:42,148` / `data-residency.ts:37-47,117-124` / `docker-deployment.md:114-117` / `global-runtime-node-pnpm.md:176` / tooling §4.10 原文。
- 切片 D 的实现约束（由审计结论派生）：必须**复用** `data-residency.ts` 的 `isMainlandDbHost` / `resolveEnforceMode` 判定，不得在门禁里第 二套白名单；独立 script，**不进 `ci` 链**（与 `verify:prod-boot` / `verify:i18n-assets` 同构）。
- 实跑存照环境偏差（**机器噪声、非契约 relaxation**，须在 §4.1 明列）：本机 Docker VM DNS 不能解析境内/外网域名（本轮已复现），且 `5432` 已被开发用 pg 容器占用 ⇒ 对拍使用临时 override 文件仅改三处：镜像来源（复用 buildkit 绕行产物）· app 服务 `dns:` · postgres 发布端口→`15432`；**不改** `NODE_ENV=production`、**不设** `DATA_RESIDENCY_ENFORCE`、**不传** `-e HOST`（这三项正是本案判据本身）。

### 4.1 落地实证（2026-10-15·人签核 A+B+C+D 后实跑）

**构建与静态面（切片 D）**

- `pnpm run build` 成功（core 55 files + api 150 files·TSC 0 issues），产物 `dist/apps/api/src/config/data-residency.js` 导出 `extractDbHost / isMainlandDbHost / resolveEnforceMode` 供门禁**复用**（未另写第二套白名单）。
- `pnpm run verify:compose-contract` 正向 **PASSED**（四面全绿：镜像 `ENV HOST=0.0.0.0` / compose 不声明 `HOST` / strict 态 DB 主机经窄放行可启 / 守卫未关）。
- **负向实证 ×4 全 EXIT=1**（改前 `cp` 备份、改后 `md5sum -c` 还原一致：`docker-compose.yml 69f1caf0…` / `Dockerfile 7b063aab…`）：① 删镜像 `ENV HOST` → 报「未声明 ENV HOST…恒 502」；② compose 补回 `HOST=0.0.0.0` → 报「与镜像层双源」；③ 删 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` → 报「既不在内置白名单也未被放行」；④ 补 `DATA_RESIDENCY_ENFORCE=false` → 报「关闭 PIPL 守卫换取启动（反模式）」——该态下 `resolveEnforceMode` 返回 `warn` 使判据②被跳过，故③④必须独立断言（实测各报 1 项不一致）。
- `pnpm run check`：Biome **307 files** 无 issue。`pnpm run ci`：**Local CI PASSED · Tests 330 passed | 16 skipped（346）** 基线零掉（fallow 仍 advisory：本机缺 `@fallow-cli/linux-x64-gnu` 平台二进制，非本片引入）。
- `pnpm run verify:prod-boot` **PASSED · /health 200**：宿主侧仍以 `.env` 的 `HOST=localhost` 绑 `127.0.0.1:7099` ⇒ **R-α「宿主开发路径不受影响」实证**。

**镜像层实跑（切片 A）**

- DNS 绕行沿用 i18n 片手法（`moby/buildkit` 容器 `--dns 223.5.5.5 --dns 114.114.114.114 -p 12345:1234 --addr tcp://0.0.0.0:1234` + `docker buildx create --driver remote tcp://127.0.0.1:12345`），但输出改 `--output type=docker,dest=`（194MB）：**`docker load` 直接成功且 HEALTHCHECK / ENV / CMD 元数据全保留**（`docker inspect` 存照 `Test=[CMD-SHELL node -e fetch(/api/v1/health)…]`、`ENV…NODE_ENV=production, HOST=0.0.0.0`、`CMD=[node dist/apps/api/src/main.js]`）——无需再 `docker import --change` 手工补元数据，比 i18n 片那次更贴近真实构建产物。
- **裸 `docker run -p`（env 内不含 `HOST`）**：容器 `Up (healthy)`；宿主 `curl :17009/api/v1/health` → **HTTP 200**（95B）；容器内 `process.env.HOST=0.0.0.0`；Dockerfile 同款探针手工执行 **EXIT=0** ⇒ **D1 症状消失**，§4.10 的裸 `docker run` 一步按字面即可跑通。
- **负向对照**（同镜像显式 `-e HOST=localhost`）：宿主 `curl` → `HTTP=000 / Connection reset by peer`，容器仍 `healthy`（探针走回环），应用日志**只有健康检查自身的 2 条请求、无我的 curl** ⇒ 发布端口无监听坐实。⚠️ 症状与 i18n 片记录的 **502** 不同形（本机 Docker 29.6.2 iptables 转发下为 RST；此前 `docker import` 那次为代理 502）：**同因不同表现**，故文档只承诺「发布端口不可达」而不写死状态码。

**编排实跑（切片 B·strict 全程开启）**

- `docker compose -f docker-compose.yml -f <临时 override> up -d` → `app Up (healthy)` + `postgres Up (healthy)`；宿主 `curl :7009/api/v1/health` **200**；容器内实测 `HOST=0.0.0.0`·`NODE_ENV=production`·`DATA_RESIDENCY_ENFORCE=undefined`·`DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres`；日志 `Server listening at http://172.20.0.3:7009` ⇒ **D2 无需关守卫即可启**（与 `global-runtime-node-pnpm.md:176` 的 `ENFORCE=false` 手法正面对照）。
- 单一真源的优先级依据同步坐实：容器内挂载的 `/app/.env` 含 `HOST=localhost`，而实际监听 `0.0.0.0` ⇒ `@nestjs/config`（dotenv）**不覆盖已存在的 `process.env`**，Docker `ENV` 胜文件——故 compose 不双写 `HOST` 不损害可达性。
- **负向**：删 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 后 `app Restarting (1)`，日志 `Data residency violation, refusing to boot: DATABASE_URL host "postgres" is outside mainland allowlist` ⇒ 窄放行确实生效，非被别的路径绕过。

**副产发现 D4（据实登记·另案待人裁，本片未改）**

- 把挂载源换成本机**真实** `.env`（storage 段为 `s3` + `us-east-1`）后，同一张图的拒启原因变成 `storage region "us-east-1" for provider "s3" is outside mainland allowlist` ⇒ 出厂 compose 的 `./.env:/app/.env` 挂载把**生产容器的驻留结论系于未被追踪的开发机文件**（`.env.example` 默认合规，用户实机常不合规——`docker-deployment.md` 旧句描述的其实是这条路径，只是错把它归给 `.env.example` 的默认值，并因此掩盖了 D2 这个必然失败的根因）。建议另案：compose 的 storage 关键项显式声明于 `environment`，或至少在文档写明「挂载的 `.env` 必须自身合规」——高危触编排，未签核不动。**→ 已于同日另案立案 [`module-deploy-env-mount-boundary.md`](./module-deploy-env-mount-boundary.md)（零代码勘察·待审计）。**
- **判据措辞订正**：切片 A 原判据写「不带任何 `-e`」，实跑不可行（`DATABASE_URL` / `JWT_SECRET` / `STORAGE_*` 为 Joi required，而镜像内按 `.dockerignore` 不含 `.env`）；本片口径应为「**不传 `-e HOST`**」，其余 env 由 `--env-file` 提供（已按此实跑，上文明列）。

**临时设施与宿主状态**：buildkit 容器 `buildkit-dcv` / builder `dcvb` / 网络 `deployverify` / pg 容器 `dcv-pg` / app 容器 `dcv-app`·`dcv-app-neg` / compose 项目 `ncdcv` / 镜像 `ncp-app-dcv:verify` / `/tmp/ncp-dcv.tar` 与两份含密钥 env 副本、两份 override、构建日志——**全部清零复核为 0**。本轮**未触碰系统 DNS**（构建经容器自钉 `--dns`），`/etc/resolv.conf` md5 `ccd28ae0776549eb3926db2148a50bff` 与改前值一致。

**追加勘察：本机 `docker build` 为何仍会失败（人问·2026-10-15）**——结论：**与本片无关的独立网络根因**，但必须成文否则下一个人照 §4.10 实跑必错。实跑三层各自取证：

- **构建失败复现（默认 builder·未改任何仓库文件）**：`docker build` 在 `Dockerfile:22` 的 `pnpm install` 阶段死亡，报 `Error when performing the request to https://registry.npmmirror.com/pnpm/11.7.0` → `getaddrinfo ENOTFOUND`。
- **为何“拉镜像能、构建不能”**：`docker info` 显示 daemon 自配 `HTTP(S)Proxy=http.docker.internal:3128`（Docker Desktop hubproxy）+ `RegistryMirrors=[docker.1ms.run, docker.xuanyuan.me]`——**只覆盖镜像拉取**（实测 `docker pull docker.m.daocloud.io/library/node:22-slim` 成功），**不传递到 `RUN` 步骤**；容器内 `dns.lookup('registry.npmmirror.com')` 实测 `EAI_AGAIN`。
- **为何“宿主能、容器不能”**：宿主 `curl` 命中 npmmirror **200** 但 `dns.lookup` `EAI_AGAIN` / 直查 nameserver `ETIME`（`10.255.255.254` 不应答）——宿主是靠 `https_proxy=http://127.0.0.1:7897` 由**代理解析**，所以「宿主装得上依赖」不是容器可达的证据。
- **三条可用路**：① 已验证的 buildkit `--dns` 绕行（本片 §4.1 所用）；② **免绕行新实测**：`--build-arg HTTPS_PROXY=http://host.docker.internal:<port>` **配合构建环境内 `NODE_USE_ENV_PROXY=1`**（Node 22 的 global `fetch` 默认不吃代理变量，仅 `pnpm` 本体原生读 `https_proxy`）——按此实跑出镜像 `sha256:8cb0aa60…` 整链跑通；**不入仓库**（把「本机有代理监听」烧进通用模板属机器特化噪声）；③ **永久修（归人做一次机器配置）**：Docker Desktop → Docker Engine → `daemon.json` 加 `"dns": ["223.5.5.5","114.114.114.114"]`（VM 出网本就通，只有解析坏·由①的成功反证）。`/etc/wsl.conf` 的 `generateResolvConf=false` 只修宿主、不修 `RUN` 步骤。**③ 已落盘并于人重启引擎后实测闭环**（见 §6 v0.2.4）：容器内 `resolv.conf` 吃到两项、npmmirror 解得 IP、plain `docker build` 全链 `EXIT=0`。
- 以上已写进 `docs/docker-deployment.md`（Troubleshooting 第 5 条 + 新小节「Build-time DNS resolution (WSL / Docker Desktop)」含分层表/探针命令/三条路，另在「Building the Docker Image」加一句跳转），**未改 `Dockerfile`**。顺手产物：daocloud `node:22-slim` 已拉到本地（今后构建第一步免联网拉基础镜像）。

## 5. 完成判据（可核验 + 穷尽）

- [x] 切片 A：`docker build` 产物镜像在**不传 `-e HOST`** 的 `docker run -p` 下命中 `/api/v1/health` **200** + `docker inspect` 健康态 `healthy`、Dockerfile 同款探针 **EXIT=0**（D1 症状消失·宪法 §4.10 那条链按其字面即可跑通）；负向 `-e HOST=localhost` 复现发布端口不可达（RST）——详见 §4.1
- [x] 切片 B：`docker compose up -d` 在 **`DATA_RESIDENCY_ENFORCE` 不设 false** 的 strict 态下全图 `Up (healthy)`，宿主 `curl :7009/api/v1/health` **200**（D2 不再需要关守卫）
- [x] 切片 B 负向：临时删除 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 后 compose 复现 `outside mainland allowlist` 拒启（证明放行确实生效而非被别的路径绕过）
- [x] 切片 C：`docker-deployment.md` 失实归因订正（与 `.env.example` 实际默认段一致·并据实登记 D4 的挂载路径）；`DATA_RESIDENCY_DB_HOST_ALLOWLIST` 在该文「Environment Variables」节成文（该文无独立变量表，以该节为落点）；tooling §4.10 两条纪律成文 + 对拍口径订正为「裸 `docker run` 不补 `-e HOST`」
- [x] 切片 D：`scripts/verify-compose-contract.ts` 就位，复用 `data-residency` 判定函数（不另写白名单），正跑 PASSED + **人造违规 ×4 全非零退出**
- [x] `pnpm run ci` **Local CI PASSED**（基线 **346（330/16）** 零掉）+ `verify:prod-boot` /health 200 + Biome 307 files 净
- [x] 临时设施清零（容器 / builder / 自建网络 / 产物镜像 / 含密钥 env 副本全部删除并复核为 0）；系统 DNS 本轮未改，md5 与原值一致存照——**据实注记**：v0.2.2 那轮曾暂留 `bkdns` / `vm-dns` / `buildkit-dnsnet`（当时作为免重启的可用产物）；2026-10-15 路① 永久修实测生效后，经人裁示已全部撤除，并复核残留 0（`docker ps -a` / `network ls` / `buildx ls` / `images` 四项均为 0；`default` builder 未动、其它项目 9 个容器未受影响）；改前 `daemon.json` 副本作为回滚件保留
- [ ] 本 plan 回写实证 + 索引状态翻面；**人类验收（签核结项）**

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-15 | 0.2.5 | 人就常驻设施 / 验收镜像 / `daemon.json` 三事裁示 | 路① 已生效⇒ 免重启绕行设施对本仓不再必需：**经人签核撤除** `bkdns` 容器 + remote builder `vm-dns` + 自建网络 `buildkit-dnsnet`，并删验收镜像 `ncp-app-dcv:verify`（四手按依赖序：buildx rm → rm -f → network rm → rmi·残留复核 0）；`daemon.json` 的 `dns` 经人确认**长期保留**（改前副本留作回滚件）；其它项目容器与 `default` builder 均未触。§5 「临时设施清零」那条由带尾巴的 `[x]` 真正结清（本仓零仓库文件变动） |
| 2026-10-15 | 0.2.4 | 人重启 Docker Desktop → 结清本片挂账的构建存照 | **永久修（路③）实测闭环**：重启后容器内 `/etc/resolv.conf` = `223.5.5.5` / `114.114.114.114`（daemon.json 下发·`docker info` 不打印 DNS 段，故以容器内文件与解析结果为准），`registry.npmmirror.com` 解得 `103.228.211.160`；**plain `docker build`（默认 builder·未加任何绕行参数）全链 `BUILD_EXIT=0`**（镜像 `d596c8edbe1b`·669MB）⇒ v0.2.3 登记的「一次 `EXIT=0` 完整构建存照」至此**结清**；上一轮新暴露的 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` / `aborted due to timeout` **本次 0 复发**（进一步佐证那是上游延迟、非解析，与路①/②无关）。**设施自愈预期已得到验证**：`bkdns`（`--restart unless-stopped`）随引擎启动回到 `Up`、remote builder `vm-dns` 仍在 `buildx ls`（`tcp://127.0.0.1:12345`·v0.34.0）、`default` 未被改动。另：路①既已生效，常驻设施对**本仓**构建不再必需（撤除与否归人）；本轮仓库内只动文档（`docker-deployment.md` 路① 补实测结论）与两片 plan 回写，**未再触 `Dockerfile` / `docker-compose.yml`**；真容器四态取证见 [module-deploy-env-mount-boundary.md](./module-deploy-env-mount-boundary.md) v0.2.1 |
| 2026-10-15 | 0.2.3 | 人签核「写 `daemon.json`（不重启）+ D4 取 A0+A2」后的环境留痕 | **永久修已落盘但未生效**：本机 `%USERPROFILE%\.docker\daemon.json` 已**合并**写入 `dns: ["223.5.5.5","114.114.114.114"]`（原 `registry-mirrors` 两项无损·改前已存副本）；引擎重启权在人，故 plain `docker build` 本轮仍不可用。另：本轮勘察时发现 Docker Desktop 引擎**未运行**（`/mnt/wsl/docker-desktop` 与 `/var/run/docker.sock` 均不在）⇒ 本片挂账的「一次 `EXIT=0` 完整构建存照」继续待补；常驻设施 `bkdns` 带 `--restart unless-stopped`、builder 注册在 `~/.docker/buildx`，预期随引擎启动自愈（**引擎停机期间未实测**）。副产 **D4 已过审计门并落地**（人签核 A0+A2）→ 见 [module-deploy-env-mount-boundary.md](./module-deploy-env-mount-boundary.md) v0.2.0 |
| 2026-10-15 | 0.2.2 | 人同意「先记备忘再执行」→ 免重启路线实测 + D4 立案 | **免重启实测**：`buildx create --builder-arg dns` 在 v0.35 不存在（unknown flag），改用常驻方案：buildkit 容器 `--restart unless-stopped --dns` + 持久 remote builder `vm-dns`（`default` 未被动）；`-t` 单用**不入本地镜像库**（remote driver 告警），**必须 `--load`**（探针已验：入库存活 + `probe-ok`）。拿本仓真实 `Dockerfile` 跑全链：corepack 取回 pnpm 11.7.0、`pnpm install` 正常解析 ⇒ **`ENOTFOUND` 死点已越**；但本次因 npmmirror 元数据超时（单请求 60s+）**新暴露第二失败模式** `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`——策略在“取不到元数据”时 **fail-closed** 却报成“lockfile 过期/被绕过”，极易诱导人去重生 lockfile（已成文为 `docker-deployment.md` 新小节 + 两条可签名区分：`ENOTFOUND`=解析 / `aborted due to timeout`=延迟）；`daemon.json` 加 `dns` 仍需人重启 Docker Desktop（会打断其它项目容器，**未代做**）。**D4 已另案立案** [`module-deploy-env-mount-boundary.md`](./module-deploy-env-mount-boundary.md)；临时探针镜像与 `/tmp` 副本已清零，仅保留 `bkdns`/`vm-dns`/`buildkit-dnsnet` 供后续构建使用 |
| 2026-10-15 | 0.2.1 | 人问「是否还有网络原因导致 docker 构建问题」→ 三层各自实测并成文 | 坐实 plain `docker build` 仍失败且与本片无关：`Dockerfile:22` `pnpm install` 报 `getaddrinfo ENOTFOUND registry.npmmirror.com`；daemon 靠 Docker Desktop hubproxy+mirror 能 `docker pull`，但**不传递到 `RUN` 步骤**；宿主 `curl` 200 是靠 `https_proxy`（127.0.0.1:7897）代理解析，而 nameserver `10.255.255.254` 不应答。三条路：`daemon.json` 加 `dns`（永久·归人）／buildkit `--dns` 绕行（本片所用）／`HTTPS_PROXY`+`NODE_USE_ENV_PROXY=1`（实测整链跑通 `sha256:8cb0aa60…`·机器特化**不入库**）。落 `docker-deployment.md` Troubleshooting 第 5 条 + 新小节（分层表/探针命令/三条路）+ 构建节跳转，**未改 `Dockerfile`**；临时探针镜像/`/tmp` 副本已清零 |
| 2026-10-15 | 0.2.0 | 人签核「A+B+C+D 全做 / compose 删 `HOST` / plan 随实现同 commit」→ 四切片落地 + 实跑取证 | 落地：`Dockerfile` 加 `ENV HOST=0.0.0.0`（四条注释载理由）·`docker-compose.yml` 删 `HOST` 并接 `DATA_RESIDENCY_DB_HOST_ALLOWLIST=postgres`（含「不得改用 `ENFORCE=false` 整闸关闭」）·`docker-deployment.md` 监听/驻留两段重写·tooling §4.10 两条纪律成文 + 对拍口径改「裸 `docker run` 不补 `-e HOST`」·新增 `scripts/verify-compose-contract.ts` + `verify:compose-contract` script（不进 `ci` 链）。取证（§4.1）：静态正/负向 ×4 全非零·Biome 307 files·**ci PASSED 基线 346 零掉**·`verify:prod-boot` 200；镜像层 `--output type=docker` + `docker load` 保留 HEALTHCHECK/ENV/CMD，裸 `docker run`（不传 `-e HOST`）**/api/v1/health 200 + healthy + 探针 EXIT=0**，负向 `-e HOST=localhost` 发布端口 RST；compose 全图 **strict 不关守卫** Up (healthy) + 宿主 200，负向删窄放行复现 `outside mainland allowlist`。另据实登记 **D4**（compose 挂载宿主 `.env` 使驻留结论系于未追踪文件·另案）与**判据措辞订正**（「不带任何 `-e`」→「不传 `-e HOST`」·Joi required 使前者不可行）；临时设施清零、系统 DNS 本轮未触 |
| 2026-10-15 | 0.1.0 | 人裁「2」把 i18n 片 §4.2 的两条部署面观察立项收口 | 首版（零代码·只读勘察）：三条缺陷 D1（镜像无 `HOST` 默认→裸 `docker run` 恒 502，且 tooling §4.10 自身规定的对拍链必失败）/ D2（出厂 compose `NODE_ENV=production` + DB 裸容器名 `postgres` 与驻留白名单互斥→strict 下必拒启；逃生阀 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 代码与 `.env.example` 皆有、编排未接线；上轮 compose 绿是靠 `ENFORCE=false` 关守卫绕过）/ D3（`docker-deployment.md:116` 把失败归给模板并不存在的 `s3/us-east-1` 默认，实际 `.env.example` 默认段 alioss/oss-cn-hangzhou 本就合规，掩盖了 D2 真因）；方案 = 切片 A 镜像 `ENV HOST`／切片 B compose 窄放行／切片 C 文档 + §4.10 两条纪律成文／切片 D 可选静态门禁；缓行另案：`/health` 依赖外网 IP 查询、DB 端口对外暴露、`envs/` 文档漂移 |

---

<!-- 变更戳 -->
正文已于 2026-10-15 / v0.2.5 变更（免重启常驻设施与验收镜像经人裁示已撤除·残留复核 0 · `daemon.json` 的 dns 长期保留），以当前正文内容为准。
