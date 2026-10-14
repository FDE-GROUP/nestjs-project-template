# 技术方案 · users 冗余暴露面收紧（删面兑现）

> 状态: **已实现·待验收**（人裁 2026-10-14：选项甲·删面·本 plan 过门即高危#2 删码签核·CI **323/13**）| 读者: **Agent**（开发依据）
> 修订: v0.2 实现登记——删文件 ×11（含本会话前片新写的 get-users.query-handler.test 3 张与 metadata.test，信封测由 workspaces/posts 两面保留）；controller 保留面原文措辞不改历史（初稿误改 PIPL 注释已订正回 C1·FR-7 原样）。两处悬挂引用连带修正（未在清单内、如实补登）：`app.module.test.ts` 编译序断言换 delete-user handler；`validation-i18n.e2e.test.ts` 寄居的 CreateUserDto 换为本地 ProbeDto（显式 validate.* 键即被测面本身，不再依赖生产 DTO）。
> blast radius: **单模块收缩片**（users 模块 3 路由删除 + 13 文件连带删・零 schema・domain/infrastructure 契约面全保留）
> 缘起: 业务面补分页片 §2.3 登记的独立议题——`GET /users` 暴露面收紧；人裁立项（选项 2）。

## 1. 背景与问题（实证链，均勘察实锤）

1. **非未鉴权裸奔**（前设修正）：`AuthModule` 全局 `APP_GUARD = SessionGuard`（deny-by-default），三端点均需登录。
2. **真问题=纵向越权 + PII 批量面**：`user` 表无租户列（用户级模块，`@TenantExempt` 据此）→ `GET /users` 任何登录用户可**跨租户全库**读 `email/firstName/lastName/role`（分页信封放大批量拉取便利）；`GET /users/:id` 可按 id 枚举；`POST /users` 任何登录用户可造用户（绕过 better-auth 注册正道，且 `User.register` 聚合工厂唯一生产点在此=用户可不经 auth 流半成品入库）。
3. **同租户 scoping 不可实现**（无租户列可过滤）——收紧只有删面或 operator 墙两形。
4. **消费方全仓实锤零**：无前端、无 e2e、无跨模块调用；tooling docs 仅一处举例提及。
5. **正当替代已存在**：管理员查全用户=治理面 `GET /api/v1/tenants/admin/users`（PlatformOperatorGuard+分页+搜索）；租户成员列表=tenancy members 域；自助面=`/users/me/*` 自有 SessionGuard。三路由为纯冗余危险面。

## 2. 方案（人裁甲：删面）

### 2.1 删除清单（API/application 门面层）

- `users.controller.ts`：删 `@Post() create` / `@Get() findAll` / `@Get(':id') findOne` 三路由及关联 import（CreateUserDto/GetUsersQuery/GetUserQuery/CreateUserCommand/PublicUser/UserReadModel/ListPageDto/Page）；保留 `@Get('me/data-export')` + `@Delete('me')`（用户自助面·PIPL 正当通道·不动）。
- 删文件 ×10：`api/dto/create-user.dto.ts(+test)`、`application/commands/create-user.command.ts`、`application/commands/handlers/create-user.command-handler.ts(+test)`、`application/queries/get-user.query.ts`、`application/queries/handlers/get-user.query-handler.ts`、`application/queries/get-users.query.ts`、`application/queries/handlers/get-users.query-handler.ts(+test 本会话新写 3 张)`。
- 删 `api/users.controller.metadata.test.ts` 整文件（剩余两路由无 `@Body/@Query` DTO，S9 锁无对象）；`api/users.controller.test.ts` 重写只余 exportMe/deleteMe 两张。
- `users.module.ts`：清理 CreateUserCommandHandler/GetUserQueryHandler/GetUsersQueryHandler 注册（CommandHandlers/QueryHandlers 数组收缩）。

### 2.2 微调甲——domain/infrastructure 契约面全保留

port `UserRepository`（list/findByEmail 消费方暂零）、adapter、`User` 聚合（`User.register` 生产者暂零）、`user.registered` 事件 + dispatcher + names **一概不连删**：§3 契约面与 §5 两段式级联删除（delete-user cascade 以 `userRegisteredEvent` 取 email）仍依赖同聚合族；ES Phase A 契约先行纪律（端口倒置三段式）不因端点面收缩而塌。fallow 若报 orphan 方法为已知可容忍，登记于此。

### 2.3 微调乙——创建通道收口声明

删 `POST /users` 后，用户创建唯一正道=better-auth sign-up（hooks/封端点既有治理链）；`User.register` 聚合工厂保留为 ES 契约面生产者（未来注册事件若接 event store 生产链，走 auth 侧编排，不回热此端点）。

## 3. 否决留档（人裁记录）

- 乙（operator 墙保面）：与治理面 platform-users 语义重复=双 SSOT 门面，维护一套"演示用"权限装配不值。
- 丙（只删读面留 create）：create 的半成品入库风险（2.1-2）恰在绕过 auth 正道，删面不删半。

## 4. DoD

- ① build+CI 绿；基线净减数如实登记（删测 ~15 张）；fallow 无**新增边界违例**（orphan 方法容忍面按 §2.2）。
- ② 实机可验（本片恰无需会话）：未鉴权 `GET/POST /api/v1/users` 由 **401（会话墙拦）→ 404（路由不存在）**；`GET /api/v1/users/me/data-export` 仍 401（墙在·面活）——三态对照即收紧铁证。
- ③ 保留面回归：exportMe/deleteMe 测绿；delete cascade 的 user.registered 依赖链零动。
- ④ 全局无悬挂引用（grep 删净 symbols）；tooling-standards §3 举例行如涉 `POST /api/v1/users` 字样同步订正（specs 措辞级·登记 diff）。

## 5. 演变记录

- v0.1（2026-10-14）：呈裁（甲删面/乙 operator 墙/丙只删读面）→ 人裁甲，微调两处照登记。
- v0.2（2026-10-14）：实现完成待验收。证据：**实机三态**——删前 GET/POST/`:id` 均 401（会话墙拦），删后 GET・POST 均 404（路由消失），me/data-export 仍 401（墙在面活）；CI **323/13**（337→323：净减 14 张与删测账吻合）；fallow 无新增违例（port list/findByEmail 暂孤儿属 §2.2 容忍面）；tooling §4.1 举例行订正为 workspaces。
