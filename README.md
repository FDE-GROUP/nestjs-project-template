# NestJS 项目模板

<p align="center">
  <a href="https://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">一个采用最佳实践的现代 NestJS 工程骨架：Fastify + Drizzle + PostgreSQL + Bun，<br/>多租户 SaaS 核心能力已就位（租户→工作区两级、全局用户 + membership、三层权限）。</p>

<p align="center">
  <a href="https://github.com/nestjs/nest" target="_blank"><img src="https://img.shields.io/github/license/nestjs/nest.svg" alt="Package License" /></a>
  <a href="https://bun.sh/" target="_blank"><img src="https://img.shields.io/badge/bun-%3E%3D%201.0.0-FFC0CB?style=flat&logo=bun&logoColor=white" alt="Bun Runtime" /></a>
  <a href="https://www.postgresql.org/" target="_blank"><img src="https://img.shields.io/badge/database-PostgreSQL-green.svg" alt="Database" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Drizzle-CEF4DD?style=flat-square&logo=drizzle&logoColor=%23C5F74F" alt="Drizzle" />
  <img src="https://img.shields.io/badge/Better--Auth-6366F1?style=flat-square&logo=lock&logoColor=white" alt="Better Auth" />
  <img src="https://img.shields.io/badge/Stripe-Payments-008CDD?style=flat-square&logo=stripe&logoColor=white" alt="Stripe" />
  <img src="https://img.shields.io/badge/Aliyun-OSS-FF6A00?style=flat-square&logo=alibabacloud&logoColor=white" alt="Aliyun OSS" />
  <img src="https://img.shields.io/badge/Tencent-COS-3399FF?style=flat-square&logo=tencentqq&logoColor=white" alt="Tencent COS" />
  <img src="https://img.shields.io/badge/Amazon-S3-FF9900?style=flat-square&logo=amazons3&logoColor=white" alt="Amazon S3" />
  <img src="https://img.shields.io/badge/Pino-Logger-11C877?style=flat-square&logo=pino&logoColor=white" alt="Pino" />
  <img src="https://img.shields.io/badge/MJML-Email-EB5757?style=flat-square&logo=mail.ru&logoColor=white" alt="MJML" />
  <img src="https://img.shields.io/badge/Docker-Containers-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

## 项目定位

**现状**：多租户 SaaS 核心能力已落地——审批制租户生命周期、两级边界（租户→工作区）、三层权限与行级隔离、平台治理（驳回/暂停/恢复/删除 + 审计）、事件溯源 Phase B 影子追加（开关缺省关）。
**方向**：订阅计费闭环与境内支付通道接入、ES Phase B 后半（同事务化/投影，待重状态上下文立项）持续推进。
**地域**：面向**中国大陆**用户——技术栈与第三方选型优先**境内可访问 / 合规可用**的方案（依赖镜像、支付、登录、监控等，详见工具标准）。

> 愿景是宪法顶层：详见 [项目愿景 `docs/specs/vision.md`](./docs/specs/vision.md)；多租户需求详见 [`docs/plans/global-tenancy.md`](./docs/plans/global-tenancy.md)。

## 技术栈

- **运行时**：[Bun](https://bun.sh/)（ESM，`"type": "module"`；开发直接运行 TS 源码）
- **框架**：[NestJS 12](https://nestjs.com/) + [Fastify 5](https://www.fastify.io/)
- **架构范式**：Clean Architecture + DDD + CQRS（[`@nestjs/cqrs`](https://docs.nestjs.com/recipes/cqrs)）垂直切片
- **数据库**：[PostgreSQL](https://www.postgresql.org/) + [Drizzle ORM](https://orm.drizzle.team/)（迁移与种子）
- **认证**：[Better Auth](https://github.com/better-auth/better-auth)（邮箱 + OAuth、会话/CSRF）——保留海外 OAuth（Google/GitHub）；**新增境内登录：微信、企业微信、钉钉、飞书**（自定义 provider；不做手机验证码登录）
- **校验**：[class-validator](https://github.com/typestack/class-validator) + class-transformer（DTO）
- **构建**：SWC（`nest build --builder swc`）
- **测试**：[Vitest](https://vitest.dev/)
- **规范**：[Biome](https://biomejs.dev/)（lint + format）
- **日志**：[Pino](https://getpino.io/) 结构化日志
- **支付**：[Stripe](https://stripe.com/)（海外·已落地）+ 微信支付 / 支付宝（大陆·**规划中**，统一 provider 抽象已预留接入面；周期扣款随通道能力，方案层细化）
- **对象存储**：多云统一接口（[AWS S3](https://aws.amazon.com/s3/) / [阿里云 OSS](https://www.alibabacloud.com/product/object-storage-service) / [腾讯云 COS](https://www.tencentcloud.com/products/cos)）
- **邮件**：[Nodemailer](https://nodemailer.com/) + [MJML](https://mjml.io/) 模板
- **文档**：[Swagger / OpenAPI](https://swagger.io/)（`@nestjs/swagger`）
- **容器化**：[Docker](https://www.docker.com/)（dev / prod）
- **工程协作**：[Husky](https://typicode.github.io/husky/) + [Conventional Commits](./COMMIT_CONVENTION.md) + commitlint

## 架构

采用 **Clean Architecture + DDD + CQRS 的垂直切片**组织业务，并以 **Bun workspaces** 拆为共享内核与参考应用两包：

```
packages/core/src/          # @core 共享内核：领域事件/聚合基类、tenancy 契约、subscriptions/workspaces 领域层
apps/reference/src/
├─ modules/<上下文>/        # 限界上下文（users / auth / tenants / workspaces / payment / storage / subscriptions / posts）
│  ├─ domain/               # 实体、值对象、领域事件、仓储接口
│  ├─ application/          # 用例（command/query + handler）、DTO 编排
│  ├─ infrastructure/       # 仓储实现、外部集成（Drizzle 等）
│  └─ api/                  # controller / HTTP 边界
├─ tenancy/                 # 租户边界：生命周期 / RBAC / 配额 / 会话 / 平台治理 / 隔离
├─ common/ config/ database/ i18n/ logger/ mailer/   # 技术基础设施
└─ main.ts / app.module.ts
```

> 八个上下文均已按垂直切片就位（S 系列重构已收口）；结构规则以 [`docs/specs/architecture.md`](./docs/specs/architecture.md) 为准。

## 文档

**规格**（`docs/specs/` — 约束性规范）

- [项目愿景](./docs/specs/vision.md)
- [项目架构](./docs/specs/architecture.md) | [中文](./docs/specs/architecture-zh.md)
- [工具标准](./docs/specs/tooling-standards.md)
- [开发工作流程](./docs/specs/workflow.md)

**方案**（`docs/plans/` — 技术方案，开发依据）

- [方案索引](./docs/plans/README.md) · [方案模板](./docs/plans/_template.md)
- [多租户能力需求](./docs/plans/global-tenancy.md)
- [中国大陆地域适配](./docs/plans/global-cn-adaptation.md)（技术方案）
- [事件溯源路线图](./docs/plans/event-sourcing-roadmap.md)

**调研**（`docs/research/` — 参考，非开发依据）

- [Better Auth 承载境内登录渠道](./docs/research/better-auth-cn-providers.md)

**指南**（`docs/` — 操作手册）

- [安装与运行](./docs/install&run.md)
- [Docker 部署](./docs/docker-deployment.md)
- [Drizzle 迁移指南](./docs/drizzle-migration-guide.md)
- [邮件模块指南（英文）](./docs/mailer-en.md)
- [OAuth 认证指南（英文）](./docs/oauth-guide-en.md)

**提交规范**

- [Conventional Commits 约定](./COMMIT_CONVENTION.md)

## 功能特性

- **分层架构**：关注点分离的模块化 / 垂直切片结构
- **配置管理**：`@nestjs/config` + [Joi](https://joi.dev/) 校验，分环境（`config/envs`）
- **异常与响应**：全局异常过滤 + 响应转换拦截器 + 日志拦截器
- **数据库**：Drizzle + PostgreSQL，含迁移（`drizzle:generate/migrate/push/studio`）与种子
- **认证**：Better Auth——邮箱登录/注册 + 社交登录（Google、GitHub + 境内企微/钉钉/飞书 genericOAuth 通道）、会话与 CSRF；全局会话墙（deny-by-default + `@Public` 旁路）
- **多租户**：审批制租户生命周期（状态机单点裁决）、租户→工作区两级边界、三层权限（平台/租户/Workspace RBAC）、仓储层行级隔离（ALS 卡点）、deny-list 即时失权
- **平台治理与合规**：驳回/暂停/恢复/删除治理端点 + 结构化审计（FR-6）；PIPL 硬删级联清除（含事件流补删）
- **事件溯源（Phase B 影子追加）**：领域事件耐久落 `event` 表（注册流 + 两级治理动作 + 驳回，治理事件面收口）；`EVENT_STORE_ENABLED` 缺省关，CRUD 仍为唯一真相源
- **存储**：多云统一接口（S3 / OSS / COS），抽象基类去重
- **邮件**：MJML 模板化发送（多语言 `i18n`）
- **支付**：Stripe 客户 / 支付意图集成（境内通道规划中·provider 抽象预留）
- **多语言**：`apps/reference/src/i18n`（中 / 英 / 日）
- **可观测**：Pino 结构化日志
- **测试**：Vitest 单元与集成测试
- **代码质量**：Biome lint/format + 本地 CI 门禁（见下）
- **容器化**：Docker（dev / prod）+ Docker Compose

## 快速开始

安装与运行的完整步骤见 [安装与运行指南](./docs/install&run.md)。常用命令：

```bash
bun install                 # 安装依赖
cp .env.example .env        # 配置环境变量（数据库等）
bun run db:setup            # 推送 schema 并写入种子（drizzle push + seed）

bun run start:dev           # 开发：Bun watch 直接运行源码
bun run build:nest          # 构建：nest build（SWC）
bun run start:prod          # 生产：bun dist/main.js
```

## 开发工作流

本项目走**本地 CI 门禁**（不依赖远程 CI），提交前一键校验：

```bash
bun run ci          # 完整门禁：check → build → test（+ fallow architecture 佐证）
bun run ci:quick    # 轻量门禁：check + test
```

- **Git Hooks**：Husky `pre-commit`（biome `lint:fix`）、`commit-msg`（commitlint）、`pre-push`（跑 `bun run ci`）。
- **提交规范**：Conventional Commits，见 [约定文档](./COMMIT_CONVENTION.md)。
- **代码智能分析**：`fallow`（经 `bunx fallow`）作为 L2 佐证工具（结果须人工二判），详见 [工具标准](./docs/specs/tooling-standards.md)。

## 联系方式

<p align="center">
  <img src="./abel-weichat.jpg" alt="WeChat 联系" width="240" />
</p>

## 许可

[MIT](LICENSE)
