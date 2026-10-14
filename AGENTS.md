# AGENTS.md

> 用途: **AI 编码工具的 L4 统一入口**（[workflow.md](./docs/specs/workflow.md) §4 / §9.5）| 状态: 候选稿 · P7 | 受众: Agent
> 定位: **消费者·非裁判**——本文件只汇总「当前真相」的**指针**，不复述细节（防双 SSOT 漂移）；与仓库冲突时**以 `docs/specs` / 代码为准**。

## 0. 权威层级（自上而下）
用户当前指令 > 代码 / 实机产物 > `docs/specs/`（宪法）> `docs/plans/`（**已审方案 = 开发依据**）> `docs/research/`（**参考、非依据**）> 本文件。
**判断 / 承诺 / 问责永远归人**（P2）；Agent 是执行者与事实查找者。

## 1. 开工前必读（指针）
- 愿景：[docs/specs/vision.md](./docs/specs/vision.md)
- 结构：[docs/specs/architecture.md](./docs/specs/architecture.md)（[中文](./docs/specs/architecture-zh.md)）
- 流程 / 原则：[docs/specs/workflow.md](./docs/specs/workflow.md)
- 工具与命令 SSOT：[docs/specs/tooling-standards.md](./docs/specs/tooling-standards.md)
- 方案状态单源：[docs/plans/README.md](./docs/plans/README.md)

## 2. 铁律（不得违反）
- **无已审方案不写码**：审计门**强制**（即便单人）；未过审计不得实现。
- **ESM + Node + 装饰器元数据** 三重约束：Controller 的 DTO（`@Body/@Param/@Query`）与构造函数注入的类**必须值导入**（勿 `import type`），否则 `design:paramtypes` 退化、DI/校验运行时静默失败（见 tooling §4.3）。Node-ESM 不兼容需人工防（CJS 默认导出、`__dirname`、dotenv 装载时序），见 tooling §4.1 R-η。
- **工具红线**（tooling §3）：只用 `pnpm`/`pnpm dlx`（禁 bun/npm/yarn）；**Biome**（禁 ESLint/Prettier）；**Vitest**（禁 jest/`bun test`）；**Drizzle + PostgreSQL**（禁 Prisma/TypeORM）；生产只走 `generate`+`migrate`，`push` 仅限 dev。
- **fallow 等静态分析结论必须二次人工核验**（大量假阳性源于反射/框架魔法，见 tooling §4.7）。
- **部署声明必须真跑对拍**（tooling §4.10）：改 `Dockerfile`/compose/`HEALTHCHECK`/workflows 后，以实跑链为验收口径（build→容器起服→`/health` 200→`healthy`），“配置就位/构建通过”不算完成；探针只能用镜像内实存能力（slim 无 wget/curl），镜像内不留产物实际跑不通的死面。
- **高危动作须人签核**（workflow §3）：schema 迁移 / 删码删依赖 / 改门禁·CI·husky·commitlint·Biome / 改 `docs/specs` 宪法与公共契约 / **改 `.env`·密钥**——Agent 不得自行执行，**不得写入真实凭证**。

## 3. 常用命令
```bash
pnpm install               # 依赖（registry 见 §6）
pnpm run start:dev         # 开发（nest start --watch，端口 7009，前缀 /api/v1）
pnpm run build             # 构建（先 build:libs 再 build:nest --builder swc）
pnpm run test              # 测试（Vitest）；check = Biome（lint+format）
pnpm run ci                # L1 门禁：check → build → test（+ fallow 佐证）
pnpm run ci:quick          # 轻量：check + test
pnpm run verify:prod-boot  # prod 回归防线：构建后真起服验 /health 200
pnpm run drizzle:generate / drizzle:migrate / db:setup   # 迁移/数据
```

## 4. 门禁与提交
- **L1 = 本地 CI**（`pnpm run ci`，不走远程 CI）；husky：`pre-commit`→`lint:fix`、`commit-msg`→commitlint、`pre-push`→`ci`。禁 `--no-verify`。
- **提交**：Conventional Commits + **内联身份**（不改全局）——
  `git -c user.name='FDE Team' -c user.email='fde.team@example.com' commit ...`；header/body 每行 ≤100。

## 5. 目录地图
pnpm workspace 双包：`libs/core/src`（@core 共享内核：`shared-kernel` + `tenancy` 契约 + `modules/{subscriptions,workspaces}` 领域层）与 `apps/api/src`（参考应用·目录名取行业惯例：`modules/<上下文>/{domain,application,infrastructure,api}`（users/auth/tenants/workspaces/payment/storage/subscriptions/posts）+ `tenancy/` 边界层 + `{common,config,database,i18n,logger,mailer}`）；文档四区 `docs/{specs,plans,research,recycle}`（`recycle/` 只进不出）。

## 6. 地域与语言
面向**中国大陆**用户：依赖镜像 `npmmirror` / Docker 国内源；第三方选型见 [global-cn-adaptation](./docs/plans/global-cn-adaptation.md)；**文档 / 注释中文优先**。

## 7. 遇到边界
需求不清 / 越界 → **停下**：回改对应 `plan` 留痕或向人提问，**不臆测**、不用启发式掩盖结构缺陷（机制修复不逐模块特判）。
