# 前端引入总纲：参考栈取自 OdooThink okee · 宪法修正 + F0–F2 分片（呈审稿）

> 适用范围: `全局`（新增顶层能力面 + 修宪）| 受众: 人（审计/裁点）
> 关联: `specs/vision.md` §3/§4/§7 · `specs/architecture.md`（Tech Stack/Directory Structure）· `specs/tooling-standards.md` §2/§3/§4 · `specs/workflow.md` §3 高危#6
> 性质: 重写型（当前方案整体重写 + 变更戳 + 演变单列）
> 状态**不在此**：单源于 [`README.md`](./README.md) 索引表

## 1. 背景与目标

**人令（2026-10-17 三点裁定）**：① 修改宪法纳入前端；② 参考 `/home/abel/EA/OdooThink_20/apps/okee/` 技术栈建立前端；③ 工具 SSOT 沿用 Biome/pnpm/Vitest。

目标：让本项目（多租户 SaaS 框架·后端面）获得**第一等前端消费面**——租户管理员自助（vision §3「用量与账单可见」此前只有 API 无 UI），并兑现 `packages/` 腾空预留（划界注记原文即「预留 ui/api-client」）。

**非目标**：不做可视化搭建（vision §5 不变）；本阶段不做前端容器化部署（另片）；不照抄 okee 业务组件（只采其**技术栈与工程形态**）。

### 参考栈勘察（实读 OdooThink_20 · 2026-10-17）

okee = pnpm workspace 单仓多包前端：`apps/okee`（壳应用）+ `packages/{okee-client, okee-web-base, okee-web-engine, okee-html-editor, okee-docs}`；根 `biome.json` 统一规范、根 scripts 含 `ci`/`ci:frontend`；**同源反代约定**（vite proxy 经反代层，不直连后端端口，免 CORS）；测试 = Vitest(jsdom+testing-library) 单测 + Playwright e2e。

| 层 | okee 实存选型 | 版本锚 |
|---|---|---|
| 框架 | React + react-dom | ~19.2 |
| 构建 | Vite + @vitejs/plugin-react + tsc --noEmit 门禁 | vite 6 代 |
| 路由 | TanStack Router（文件式）+ devtools | ^1.130 |
| 样式 | Tailwind CSS 4（@tailwindcss/vite）| ^4.3 |
| 组件基元 | shadcn 家族：components.json + class-variance-authority + clsx + tailwind-merge + lucide-react（icons）+ cmdk + sonner(toast) + @floating-ui/react-dom | — |
| 数据/图表（按需） | chart.js / dnd-kit / luxon / marked+dompurify | — |
| 测试 | Vitest + jsdom + @testing-library/react；Playwright | vitest 沿用 / @playwright/test ^1.63 |
| 规范 | 根 Biome（lint+format 单工具） | 与本仓红线③天然一致 |

## 2. 方案

### 2.1 宪法修正案（三处 · 批准后才落入 specs 正文，本稿为拟落措辞）

- **vision.md**：§4 增第 **7 支柱「人的界面（Human Interface）」**——「SaaS 三支柱（租户/计费/合规）之外须有**消费面**：租户管理员自助 UI（成员/工作区/订阅/账单）与平台运营面（审批/治理）以前端形态落地；前端与后端同仓共 workspace，经 OpenAPI 契约消费后端，**不反向渗透**（后端不得依赖前端制品）」；§7 阶段 3 行加注（自助管理面 = 前端首落位）；§9 演变表增行。
- **architecture.md**：「Directory Structure」增 `apps/web`（可部署·前端壳应用）与 `packages/api-client`（可交换制品·类型化客户端）落位及划界语义（apps/=可部署 / libs/=私有共享 / packages/=可交换制品 的既有三区 taxonomy 直接覆盖前端，无需新语义）；「Tech Stack」增前端行。
- **tooling-standards.md**：§2 工具矩阵增「前端」行（React/Vite/Tailwind/TanStack Router/Biome/Vitest/testing-library）；§4 新增 **§4.12 前端使用规范**（同源反代免 CORS、组件按需 shadcn 式复制不引整库、Biome 覆盖 tsx 的 jsx 配置、npmmirror 版本滞后核验）；§3 红线增补一句：前端**禁** CRA/webpack 存量工具链、**禁**第二 CSS 框架混用（Tailwind 单源）。

### 2.2 落地分片（每片独立过验收，本片只承诺 F0）

1. **F0 · 骨架片（本 plan 批准即实施）**：`apps/web` 脚手架（Vite 6 + React 19 + Tailwind 4 + TanStack Router）+ 根 Biome 覆盖 tsx + 根 vitest projects 收纳 web 单测 + vite dev proxy `/api/v1 → localhost:7009`（okee 同源约定的本地形）+ **最小登录闭环页**（BA email+password 登录/登出·显示当前会话用户）。完成判据：`pnpm run ci`（L1）含 web 面全绿；登录页对 dev 后端真跑 200。
2. **F1 · api-client 片**：`packages/api-client` 从 `openapi/openapi.yaml` 生成 typed client（复用 openapi-codegen 链）+ errorCode 码表做实（错误契约 plan 既有预留）。
3. **F2 · 租户自助面片**：workspace/成员/订阅可见与操作 UI（vision 阶段 3 自助管理首段）。
- F0→F1→F2 严格串行；每片完成才呈下一片，不并车。

### 2.3 待裁点（呈审时逐条裁，未裁不动）

- **① Playwright 是否采**（e2e 面）：okee 采且链路成熟；采则入 tooling §2 矩阵，浏览器二进制经 npmmirror 镜像安装。**推荐：F0 暂不采**（Vitest 组件测先行），F2 时重呈。
- **② 组件基元深度**：仅 shadcn 式按需复制（推荐·okee 同款）vs 引成品组件库（如 Element Plus·React 生态弱）。**推荐：shadcn 式按需**。
- **③ 包名/目录名**：`apps/web`（推荐·对应 apps/=可部署语义）vs `apps/console`。api-client 名 **@saas/api-client**（推荐）待定名。
- **④ React 19/Vite 6 在 npmmirror 的可得性**：实施首日对拍 registry（本仓有 npmmirror 滞后先例），滞后则降版本并登记 §6。

## 3. 影响面与风险

- **blast radius**：全局（新增 workspace 成员 + 修宪·高危#6 人已令）；**不改**后端运行时代码、不改 Dockerfile/compose（部署面留 F2 后专项）；husky/commitlint 不动。
- **命中高危清单**：#6 改 `docs/specs` 宪法（人 2026-10-17 令① 明示授权，措辞仍以本 plan 为拟稿、批准为界）；Biome 配置扩 tsx 属门禁面随批（人令③ 授权工具面沿用）。
- **回滚**：F0 全部可逆——删 `apps/web` + 还原三处配置即净；修宪部分随 revert 回退（历史演变表行保留留痕）。
- **主要风险**：npmmirror 版本滞后（§2.3④ 预防）；前端依赖体积进 lockfile（评审容忍）；scope 蔓延（§2.2 串行 + 非目标钉住）。

## 4. 审计记录

> 无已审方案不写码。全局 / 修宪 → 人签核。

- 结论：**（待裁）** 人令三点已构成方向授权；本 plan 请裁：① 宪法修正措辞（§2.1）放行与否；② §2.3 四待裁点；③ F0 范围认否。
- 未决项：上三组。
- 审计人 / 日期：待。

## 5. 完成判据（可核验 + 穷尽）

- [ ] §2.3 四待裁点获人裁定
- [ ] 宪法三处修正落入 specs 正文（vision/architecture/tooling 各补演变行）
- [ ] F0：`pnpm run ci` 全绿（check 覆盖 apps/web tsx + web 单测入根 vitest）
- [ ] F0：dev 后端起 7009 → 浏览器登录页真调 BA 登录 → 会话可见 → 登出，实跑取证
- [ ] README 索引翻「已审计·实施中」→ F0 完成后翻待验收
- [ ] 人类验收后结项

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人令三点（修宪/参考 okee 栈/工具 SSOT 沿用）→ 起草呈审 | 首版：okee 实读勘察 + 修宪拟稿 §2.1 + F0–F2 分片 + 四待裁点 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.1.0 起草（**呈审稿·待审计**——人令三点为方向授权，措辞与待裁点归人放行后方动宪法与代码）；发现登 §6 不入正文。
