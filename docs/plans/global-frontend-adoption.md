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
| 构建 | Vite + @vitejs/plugin-react + tsc --noEmit 门禁 | **vite ^8.0.12（实测复勘修正·呈审「6 代」系 package.json 截半阅读之推断误）** |
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

1. **F0 · 骨架片（本 plan 批准即实施）**：`apps/web` 脚手架（Vite 8 + React 19 + Tailwind 4 + TanStack Router）+ 根 Biome 覆盖 tsx + 根 vitest projects 收纳 web 单测 + vite dev proxy `/api/v1 → localhost:7009`（okee 同源约定的本地形）+ **最小登录闭环页**（BA email+password 登录/登出·显示当前会话用户）。完成判据：`pnpm run ci`（L1）含 web 面全绿；登录页对 dev 后端真跑 200。
2. **F1 · api-client 片**：`packages/api-client` 从 `openapi/openapi.yaml` 生成 typed client（复用 openapi-codegen 链）+ errorCode 码表做实（错误契约 plan 既有预留）。
3. **F2 · 租户自助面片**：workspace/成员/订阅可见与操作 UI（vision 阶段 3 自助管理首段）。
- F0→F1→F2 严格串行；每片完成才呈下一片，不并车。

### 2.3 待裁点（呈审时逐条裁，未裁不动）

- **① Playwright 是否采**（e2e 面）：okee 采且链路成熟；采则入 tooling §2 矩阵，浏览器二进制经 npmmirror 镜像安装。**推荐：F0 暂不采**（Vitest 组件测先行），F2 时重呈。
- **② 组件基元深度**：仅 shadcn 式按需复制（推荐·okee 同款）vs 引成品组件库（如 Element Plus·React 生态弱）。**推荐：shadcn 式按需**。
- **③ 包名/目录名**：`apps/web`（推荐·对应 apps/=可部署语义）vs `apps/console`。api-client 名 **@saas/api-client**（推荐）待定名。
- **④ React 19/Vite 8 在 npmmirror 的可得性**：实施首日对拍 registry（本仓有 npmmirror 滞后先例），滞后则降版本并登记 §6。

## 3. 影响面与风险

- **blast radius**：全局（新增 workspace 成员 + 修宪·高危#6 人已令）；**不改**后端运行时代码、不改 Dockerfile/compose（部署面留 F2 后专项）；husky/commitlint 不动。
- **命中高危清单**：#6 改 `docs/specs` 宪法（人 2026-10-17 令① 明示授权，措辞仍以本 plan 为拟稿、批准为界）；Biome 配置扩 tsx 属门禁面随批（人令③ 授权工具面沿用）。
- **回滚**：F0 全部可逆——删 `apps/web` + 还原三处配置即净；修宪部分随 revert 回退（历史演变表行保留留痕）。
- **主要风险**：npmmirror 版本滞后（§2.3④ 预防）；前端依赖体积进 lockfile（评审容忍）；scope 蔓延（§2.2 串行 + 非目标钉住）。

## 4. 审计记录

> 无已审方案不写码。全局 / 修宪 → 人签核。

- 结论：**已审计·放行**——人 2026-10-17 令「同意」：① §2.1 修宪措辞原样批准；② §2.3 四待裁点按推荐档裁（Playwright 缓采 F2 重呈 / shadcn 式按需 / `apps/web`+`@saas/api-client` / registry 对拍自跑）；③ F0 范围认可即刻实施。
- 未决项：无（F2 时 Playwright 重呈为既定期限，非未决）。
- 审计人 / 日期：人 / 2026-10-17。

## 5. 完成判据（可核验 + 穷尽）

- [x] §2.3 四待裁点获人裁定（令「同意」= 推荐档全采）
- [x] 宪法三处修正落入 specs 正文（vision/architecture/tooling 各补演变行）
- [x] F0：`pnpm run ci` 全绿（biome 392 文件含 tsx·新基线 **529 passed/31 skipped·90 files**（+6 web 测）·EXIT=0）
- [x] F0：实跑取证——vite dev :5173 反代打穿 BA 面四步闭环：sign-up 200 → sign-in 200（cookie 落 jar）→ get-session 带出 user → sign-out（带 Origin 头·BA CSRF 语义）200 → get-session 收敛 `200+null`；两实机真值已注记源码（登出面非 401 是 200+null；sign-out 需 origin）
- [x] README 索引翻「已完成·待人类验收」
- [x] 人类验收后结项（令「同意」2026-10-17，验收 `d50672f`+`54c57be` 两笔；F1 另片呈审）

## 6. 演变记录

| 日期 | 版本 | 变更原因 | 内容修订 |
|------|------|----------|----------|
| 2026-10-17 | 0.1.0 | 人令三点（修宪/参考 okee 栈/工具 SSOT 沿用）→ 起草呈审 | 首版：okee 实读勘察 + 修宪拟稿 §2.1 + F0–F2 分片 + 四待裁点 |
| 2026-10-17 | 0.2.0 | 人令「同意」过审计门 | §4 结论翻「已审计·放行」（措辞原样批准·四裁点按推荐档·F0 即刻实施）；§5 前两框勾齐；戳翻实施中。 |
| 2026-10-17 | 0.3.0 | F0 落地 + 三笔自捕登记 | ①**install 引出的真回归**：本次 pnpm install 修剪了 root node_modules 历史幽灵链接，`verify:prod-boot` 红拓出 root deps 两漏宣（@nestjs/throttler·@casl/ability 此前靠幽灵存活）——按「依赖 hoist 于根」既有纪律补 root 声明修复，防线设计目标兑现（CI 绿≠prod 起服可跑）；②fetchStub 形状自捕两例（json 属性名冲突把 payload 函数当值返回）；③sign-out 403=BA CSRF 缺 Origin 头（curl 语义差非应用缺陷，浏览器自动携带）。AGENTS §5 目录地图同步 apps/web。 |
| 2026-10-17 | 0.4.0 | 人类验收结项 | 令「同意」= F0 片验收通过（反代四步闭环 + L1 新基线 + 三笔自捕账目认可）；§5 全勾，戳翻「已验收·结项」。F1（api-client）呈审片另起。 |

---

<!-- 变更戳 -->
正文已于 2026-10-17 / v0.4.0 更新（**已验收·结项——人类令「同意」，F0 骨架片交付认可；F1 另片呈审**）；发现登 §6 不入正文。
