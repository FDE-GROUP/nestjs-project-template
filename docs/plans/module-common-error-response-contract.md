# 技术方案 · 错误响应契约增强（requestId + errorCode）

> 状态: **已验收·结项**（人验收 2026-10-14·commit `fed300b`·CI **327/13** 新基线）| 读者: **Agent**（历史开发依据·已归档）
> 修订: v0.3 实现订正——§3.1 样例的 `String(request.id) ?? 'req-unknown'` 实作为与 LoggingInterceptor 完全同形的 `?? String(request.id ?? 'req-unknown')`（避免 `String(undefined)`='undefined' 穿入兜底链）；DoD ②的校验端点实机验证改由 e2e 迷你装配覆盖（本仓 Nest 侧无公开无鉴权校验端点，auth 走 better-auth 插件不过 Nest pipe），filter 侧 404/401 实机两证坐实
> blast radius: **公共契约小片**（全局 filter 两个产体点 + `ErrorResponse` 形状·**形态甲为纯增量非破坏**·不动任何业务抛错点）
> 缘起: softkit-core `libs/exceptions` 评价（2026-10-14）照出本仓两个实证缺口——①错误响应体**不带关联 id**（而 `x-request-id` 链昨日已建，`currentRequestId()` 唾手可得）；②**无 `errorCode`**（知识库异常体系篇自认头号缺口："error 只是 HTTP 类别名"；前端入场后 api-client 只能 message 字符串匹配，跨 i18n 语言失灵）。人裁立项（选项 1）。

## 1. 背景与既有事实（勘察坐实）

- **两个响应体产出点**（必须同构改，否则校验错误与通用错误形状漂移）：
  - `apps/api/src/common/filters/http-exception.filter.ts`：`@Catch()` 兜底，产出 `{statusCode, message, error, timestamp, path}`；
  - `apps/api/src/common/common.module.ts` 的 `validationErrorBodyFormatter`：`I18nValidationExceptionFilter` 的定制 formatter，产出同形（注释明言"exact same response contract"）。
- **既有合同锁**：`apps/api/src/i18n/validation-i18n.e2e.test.ts` 断言现形状字段；`HttpExceptionFilter` **本体零单测**（本片补齐）。
- **关联 id 源已就位**：`@core/shared-kernel/context/request-context` 的 `currentRequestId()`（hook 先于一切 Nest 层运行，filter 内必命中；`/health` 等旁路以 `request.id` 兜底）。
- **softkit 分层借鉴点**：字段进公共契约、**具体码 enum 留消费方**（其 `error-codes.enum.ts` 在 app vo）——通用库不定义业务码，这个克制照搬。
- **铁律不破**：本仓"只用 Nest 内置异常 + 单 filter"路线不变——**不引入自定义异常类**。errorCode 载体采用 `HttpException` 原生 object response 形态：`throw new ForbiddenException({ message: '…', errorCode: '…' })`，filter 透传摘取即可，零新类。

## 2. 形态抉择（核心裁决·甲乙）

**形态甲 · 增量补强（推荐）**：现 5 字段**一个不动**，追加 `requestId: string`（恒有）+ `errorCode?: string`（调用方提供才出现）。
- 优点：非破坏（下游既有消费者零影响）；实现面最小；前端按需消费新字段。
- 代价：不是 RFC 7807 标准形状（但我们前端为自建适配层，非公共 API 生态，标准收益主要面向第三方代理——不为错对象付破坏成本）。

**形态乙 · 迁 RFC 7807（列出供裁）**：`{type, title, status, detail, instance, errorCode?}` 整体换形。
- 论据：前端尚未入场=最后便宜改窗；模板若被当公共 API 用则标准形状有真实互操作价值。
- 反对：破坏所有下游既有消费者；`type`（文档链接）语义我们暂无处填（**softkit 自己的源码里该字段仍是 `'todo implement link to the docs'`**——形式超前于内容的活证）；`title/detail` 与现 `error/message` 语义重合，纯改名 churn。

**本 plan 按甲展开**；若人裁乙，§3 起全部重写、须另立 v0.2 再审。

## 3. 变更设计（形态甲）

### 3.1 契约
```ts
interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId: string;   // 新·恒有：currentRequestId() ?? String(request.id) ?? 'req-unknown'
  errorCode?: string;  // 新·可选：仅异常 object response 携带时透传
}
```
兜底链与 `LoggingInterceptor` 同源同形（三处一致，不另造口径）。

### 3.2 两个产出点
- **filter**：object response 分支加摘一行 `errorCode = exceptionResponseObj.errorCode as string | undefined`；`responseBody` 补 `requestId`（`request` 已由 `ctx.getRequest()` 在手）+ `errorCode`（undefined 时 JSON 序列化自然消失，无需条件删键）。
- **formatter**：返回体补 `requestId`（同一兜底链·`request` 泛型参数需扩 `id` 字段）；校验失败**不**硬编码 `VALIDATION_FAILED` 码（statusCode+message 已可辨型，留待前端真实需求——不为假想需求预填）。

### 3.3 明确不做
- 不动任何业务抛错点（不逐个补 errorCode——**机制先行**，码表等消费方（前端 api-client 立项）按需定义）；
- 不引入自定义异常基类/转换 filter（softkit C 档已否决留档）；
- 不动 `TransformInterceptor` 成功形状；不动 OpenAPI 文档注解（挂账项：前端集成期用官方 `@ApiResponse` 呈现错误契约）。

## 4. 测试设计（DoD）

1. **`HttpExceptionFilter` 单测（新建·补零单测欠账）**：≥4 测——①`requestStorage.run` 下捕获异常体含 `requestId`=ALS 值；②无 ALS 上下文时回落 `request.id`；③object response 带 `errorCode` 时透传、不带时键缺席；④非 HttpException（裸 Error）→ 500 形状含 `requestId` 不缺。
2. **`validation-i18n.e2e.test.ts` 增补**：断言校验错误响应体 `requestId` 存在（形状契约同步锁）。注：该测为真 Fastify 迷你装配但不经 main.ts hook，故 `requestId` 将走兜底链第二级 `request.id`——恰实测兜底链。
3. **formatter 直测**（若 e2e 覆盖不到 fallback 形态则补单测一张）。
4. **实机佐证**：curl 一个 4xx（带自造 `x-request-id: err-77`）→ 响应体 `requestId === 'err-77'` 且与响应头一致；带 errorCode 示例需临时构造？——**否**，以单测③锁定机制即可，实机证 requestId 面。
5. CI 全绿（基线 320/13 只增不减）。

## 5. 演变记录

- v0.1（2026-10-14）：初稿待审计。裁决点：**甲·形态**（甲增量/乙 RFC7807 迁移）；**乙·errorCode 机制先行零业务迁移**（或附 1 处示范迁移）；**丙·校验 formatter 不预填 VALIDATION_FAILED 码**；**丁·DoD 5 项照建议**。
- v0.2（2026-10-14）：人批准过门，甲乙丙丁照建议。
- v0.3（2026-10-14）：实现完成待验收——filter+formatter 双产出点同构补形；filter 单测新建 ×7（补零单测欠账·含脏数据 errorCode 不透传）；e2e 契约锁增补（requestId 存在+errorCode 键缺席）；实机 404/401 体 requestId 与头同源两证；CI **327/13**（+7）。订正两处见头部修订行。
- v0.4（2026-10-14）：人验收结项。errorCode 码表与业务迁移、OpenAPI 错误契约注解留前端 api-client 立项按需消费（机制已备）。
