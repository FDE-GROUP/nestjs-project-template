# 项目架构

## 核心设计原则

- **整洁架构（Clean Architecture）**：每个限界上下文内部划分为四层，依赖方向严格向内：`api → application → domain ← infrastructure`。domain 层除共享内核外不依赖任何框架。
- **领域驱动设计（DDD）**：业务逻辑封装在零框架依赖的聚合根中，配合值对象、领域事件与仓储端口（port）；infrastructure 层提供端口的适配器（Drizzle）。
- **CQRS**：写操作走 `Command → CommandHandler`，读操作走 `Query → QueryHandler`，经由 `@nestjs/cqrs` 的总线分发。Controller 绝不直接调用 service。
- **垂直切片（Vertical Slice）**：按功能而非技术分层组织（`src/modules/<context>`）。上下文之间只能通过领域事件耦合，禁止 import 另一个上下文的 `domain/` 或 `infrastructure/`。
- **Event Sourcing（确定采纳·分期递进）**：人澄清 2026-10-14——ES 为确定的架构目标，不再以「某上下文真需要才做」为前提；分期节奏与审计/迁移门禁维持。当前阶段（Phase A）领域事件仅进程内派发；Command→Handler 写路径、聚合的 `recordEvent/pullDomainEvents` 钩子与事件信封字段均已按 ES 形态预留。详见 [event-sourcing-roadmap.md](../plans/event-sourcing-roadmap.md)。
- **EDA（事件驱动架构·确定采纳）**：领域事件是上下文间**唯一**集成机制；演进路径 = 进程内派发（已落地）→ 同事务 outbox 耐久发布（Phase B）→ 跨进程 broker 订阅（仅微服务触发器成立后，见 [microservice-readiness.md](../plans/microservice-readiness.md)）。

## 目录结构

```
src/
├── app.module.ts            # 根模块（引入全局基础设施 + 各功能上下文）
├── main.ts                  # 启动：Fastify、ValidationPipe、Swagger、URI 版本化
├── shared-kernel/           # 跨上下文原语
│   ├── domain/              #   AggregateRoot、DomainEvent（纯净，零框架依赖）
│   └── cqrs/types.ts        #   BaseCommand / BaseQuery（封装 @nestjs/cqrs）
├── modules/                 # 限界上下文（垂直切片）
│   ├── users/               # ★ 完整模式的参考实现
│   │   ├── domain/          #   entities/ value-objects/ events/ repositories/（端口）
│   │   ├── application/     #   commands/ queries/ read-models/（处理器）
│   │   ├── infrastructure/  #   Drizzle 仓储适配器、映射器、事件分发器
│   │   ├── api/             #   Controller + DTO（HTTP 传输层）
│   │   └── users.module.ts  #   装配 CqrsModule + 处理器 + 端口→适配器绑定
│   ├── auth/                # Better Auth 适配层（为未来 DDD/ES 预留的位置）
│   ├── stripe/              # 支付上下文
│   └── storage/             # 云存储上下文（S3/OSS/COS）
├── database/                # 全局基础设施：Drizzle 客户端、schema、迁移、seed
├── config/                  # 全局基础设施：类型安全配置 + Joi 校验
├── logger/  mailer/  common/  i18n/   # 横切基础设施
```

## `users` 上下文（参考流程）

```
POST /users
  → UsersController（api 层）              # 由已校验的 DTO 构造 CreateUserCommand
  → CommandBus.execute                     # @nestjs/cqrs
  → CreateUserCommandHandler（application）
        repo.findByEmail → 存在则抛 ConflictException
        User.register(...)（domain）       # 不变量校验 + recordEvent(UserRegisteredEvent)
        repo.save(user)（端口 → infrastructure 的 DrizzleUserRepository）
        eventBus.publishAll(user.pullDomainEvents())   # 当前仅进程内派发，未来落事件存储
  → 返回 PublicUser 投影（201）
```

读接口（`GET /users`、`GET /users/:id`）的 `Query` 处理器直接经 `DrizzleService` 读写库
（务实的 CQRS 读侧，绕过 domain）。

## 分层依赖规则

| 层 | 允许 import | 禁止 import |
|---|---|---|
| `domain/` | `shared-kernel/domain`、同域内其他文件 | Nest、Drizzle、DTO、HTTP、其他上下文 |
| `application/` | `domain`、`shared-kernel/cqrs`、`@nestjs/cqrs`/common | 其他上下文的 `domain`/`infrastructure` |
| `infrastructure/` | `domain`（端口）、Drizzle、Nest | —（它是适配器边界） |
| `api/` | `application`（命令/查询）、DTO | 把 `domain` 实体当传输对象 |

Domain 纯净性由一个测试锁定：扫描 `src/modules/users/domain/**` 是否出现
`@nestjs/*`、`drizzle-orm`、`@app/database` 的 import。

## 上下文间通信

上下文之间绝不互相 import 内部实现。跨上下文的副作用通过领域事件表达，用
`@EventsHandler` 订阅。`auth`、`stripe`、`storage` 目前保持为薄适配层；`auth` 是
后续在不影响 `users` 模式的前提下进行 DDD/ES 化的指定位置。

## 技术栈

- **运行时**：Bun（ESM，`"type": "module"`）
- **框架**：NestJS 12 + Fastify
- **架构**：Clean Architecture + DDD + CQRS（`@nestjs/cqrs`）
- **数据库**：PostgreSQL + Drizzle ORM（显式迁移）
- **认证**：Better Auth
- **测试**：Vitest（+ `unplugin-swc` 输出装饰器元数据）
- **Lint/格式化**：Biome

## 校验注意事项

Controller 中的 DTO 必须**按值导入**（而非 `import type`），SWC 才会为全局
`ValidationPipe` 保留 `design:paramtypes`。`biome.json` 中已对 `*.controller.ts`
关闭 `useImportType`，防止 auto-fix 把这些导入改回 `import type` 而悄悄摧毁校验。

## 部署

- **开发**：Bun + Docker PostgreSQL（`docker-compose.dev.yml`）
- **生产**：Docker Compose（应用 + PostgreSQL）
- **文档**：Swagger/OpenAPI 自动生成（`/docs`）
