# 技术方案 · 微服务就绪首切片（表所有权纪律成文 + codegen 导出模块）

> 状态: **已审计**（人批准 2026-10-14·高危#5/#4 随批视同签核；§6 甲乙丙照建议自裁）| 读者: **Agent**（开发依据）
> blast radius: **global**（#1 触 `specs/architecture.md` 附录 = 高危#5 改宪法；#4 触构建脚本 + （待签）GitHub workflow = 高危#4）
> 关联: [microservice-readiness](./microservice-readiness.md) §4-①（本切片由其审计门放行立项）· [global-tenancy](./global-tenancy.md) §9.5（S10 边界）· `specs/architecture.md`

## 1. 背景与现状（实测 2026-10-14）

- 母 plan 已裁首切片 = §2.3 **#1 表所有权纪律 + #4 codegen 导出模块**（全取）。
- **#1 取证（16 个 drizzle 仓储 grep）**：写侧现状大体干净——各仓储写操作均落本上下文表；跨点集中在**读侧**（tenants 治理统计 join posts/workspaces、user-governance 读 auth core `user` 表）。即成文纪律大概率以现状为绿基线，把惯例固化为可审契约。
- 表归属现状盘点（写侧 owner）：`user/session/account/verification` = auth core（Better Auth adapter 写）；`organization/member/invitation/user_status` = tenancy；`workspace` = workspaces；`post` = posts；`subscription` = subscriptions；`event` = database 基础设施（ES 端口独占）。
- **#4 取证**：`openapi:export` 现为 `curl localhost:7009/openapi.yaml`（须先起服务）；`openapi/` 目录空（仅 .gitkeep）；DB-free 整树 boot 基座已由 app-boot 冒烟验证。CI workflow `deploy-swagger.yml` 同样依赖"起服务 + sleep 15 + curl"。

## 2. 目标 / 非目标

**目标**：
1. 表所有权纪律成文（`specs/architecture.md` 附录）+ 机读单源（ownership 映射常量）+ 守卫测进 CI；
2. codegen 导出：不依赖运行服务、DB-free 直出 `openapi/openapi.yaml`，`openapi:export` 脚本切换。

**非目标**：不改任何仓储行为；不动 schema/迁移；不引入 AST 工具链（grep 级守卫够用，防过度机制化）；#2/#3/#5 就绪项不碰（母 plan 已裁缓）。

## 3. 设计

### 3.1 #1 表所有权纪律（写侧严格 · 读侧 CQRS 固有宽松）

- **纪律条款（附录成文核心）**：① 任何仓储/服务的 `insert/update/delete` 目标表必须属本上下文 owned 集；② 跨上下文**读**（select/join）允许，但只出现在 read-model/治理统计文件（现状即此形态）；③ 跨上下文外键只允许指向 auth core 表（对齐 S2 惯例）；④ 新表入 owned 集须改映射单源并过审计门。
- **机读单源**：`apps/reference/src/database/table-ownership.ts`——`{ context: [tableNames] }` 常量（与 §1 盘点一致），附录文档引用之（文档写语义、代码持清单，防双 SSOT）。
- **守卫测**：新增 vitest 静态扫描测（如 `table-ownership.guard.test.ts`）：正则提取 `modules/*/` 与 `tenancy/` 源文件中 `db.(insert|update|delete)(<table>` 目标表名，断言 ∈ 本上下文 owned 集；违例即红。读侧不查（条款②为语义约束，靠文件命名与审计）。

### 3.2 #4 codegen 导出模块

- 新 `apps/reference/src/openapi-codegen.ts`：`NestFactory.create(AppModule)` + 与 app-boot 冒烟同源的 DB-free 覆盖策略（override DrizzleService 等外部依赖 provider）→ Swagger 插件生成 → 写 `openapi/openapi.yaml` → `app.close()` 退出。仅 yaml（与现产物一致），不加 json。
- `package.json` `openapi:export` 改为 `bun apps/reference/src/openapi-codegen.ts`（保留原 curl 为 `openapi:export:live` 备用？——**否**，不留双径，防漂移；回滚 revert 单 commit 即可）。
- **待签核项（高危#4）**：`deploy-swagger.yml` 同步简化（删"起服务+sleep 15"，直接 `bun openapi:export`）。若人不签，workflow 原样保留仍可用（产物路径不变），仅 #4 收益减半。

## 4. 风险与回滚

- 高危命中：**#5 改 specs 附录**（diff 随本 plan 审计呈签，过门后写入）；**#4 改 workflow**（单独可裁·见 §3.2）。
- 守卫测若扫出现状违例（预期无）：停下呈报，不自动豁免、不逐模块特判（机制铁律）。
- 回滚：两半各自独立 revert（#1 文档+测 / #4 脚本+入口）。

## 5. 完成判据（DoD）

- [x] `table-ownership.ts` 单源 + 守卫测进 CI（现状绿基线 3/3 通过·含例外零暗账 + 新表漏登记反向断言）；`specs/architecture.md` 附录写入（经审计门签核·语义与清单分离防双 SSOT）
- [x] `openapi-codegen.ts` DB-free 直出 `openapi/openapi.yaml`，产物与运行服务导出**字节级一致**（831 行 diff 空·强于 paths 数对比）
- [x] `openapi:export` 脚本切换；workflow 简化（删起服务+sleep+curl hack·订正失效的 `'src/**'` 触发 paths → `apps/**`+`packages/**`）——Pages 构建首跑随 push 兑现（观察项）
- [x] CI 全绿 276/10（基线 273/10 +守卫测 3）·Biome 净；母 plan/README 已回灌；提交 + push

## 6. 审计记录

**开放未决（附建议·待人裁）**：
- 甲 · 守卫是否连读侧一并强制（如 read-model 文件名单元约束）：**建议否**——第一期写侧严格 + 读条款靠语义与审计，防过度机制化；
- 乙 · workflow 简化是否纳入本切片（高危#4 签核）：**建议纳入**（不签则 workflow 原样、#4 半收益）；
- 丙 · `event` 表 owned 集归 database 基础设施（非业务上下文）：**建议是**——ES 端口独占写面（DrizzleEventStore），业务仓储不得直接写 event。

- 2026-10-14 v0.1: 初稿（待审计·取证见 §1）。
- 2026-10-14 v0.2: 人「同意」过审计门（高危#5 附录写入、#4 workflow 简化随批视同签核）；甲乙丙照建议自裁。实现期新发现：① `suspend-user` handler 直写 `session` 表（auth core）——治理失权链所需，按**显式声明例外**入单源而非掩盖（§1 前轮 grep 只扫仓储漏了 handler，已补全仓写面扫描）；② workflow 触发 paths 写 `'src/**'` 早已失效（源码在 apps/reference/src），随 #4 简化一并订正。
- 2026-10-14 v0.3: 实现交付——#1 单源+守卫测（3 测：违例即红/例外零暗账/新表漏登记）+ specs 附录；#4 codegen 字节级一致直出 + 脚本切换 + workflow 简化；CI 276/10。结项待验收。
