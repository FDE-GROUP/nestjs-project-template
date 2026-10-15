// 部署契约「自洽性」回归防线——把 plan module-deploy-host-residency 的三条取证固化为门禁。
//
// 缘起（三条全靠人工实跑才发现，静态门禁当时全绿）：
//   D1 `Dockerfile` 无 `HOST` → 代码侧默认 `localhost` → 容器只绑回环 → 裸 `docker run -p` 恒 502
//      （而宪法 tooling §4.10 规定的对拍链第二步就是裸 `docker run`）。
//   D2 出厂 compose 同时声明 `NODE_ENV=production`（→strict）与 DB 服务名主机 `postgres`
//      （不属内置境内白名单）→ strict 下**必**拒启；逃生阀 `DATA_RESIDENCY_DB_HOST_ALLOWLIST` 未接线。
//   D3 曾用 `DATA_RESIDENCY_ENFORCE=false` 关掉整个守卫换取 compose 跑通——属反模式。
// 本脚本只做**声明面一致性**静态校验（实跑对拍仍是 §4.10 的验收口径，二者互补不互替）：
//   ① 监听默认单一真源在镜像层，且 compose 不双写 `HOST`；
//   ② strict 态下 compose 的 DB 主机必须「命中境内白名单」或「被窄放行」；
//   ③ compose 内不得出现 `DATA_RESIDENCY_ENFORCE=false`（整闸关闭）。
// 判定函数**复用**产物里的 `data-residency.js`，避免门禁写第二套白名单而与之漂移。
// 前置：先 `pnpm run build` 产出 dist。触发：`pnpm run verify:compose-contract`。
//
// 运行时=Node：js-yaml 为既有依赖（`main.ts` 生成 openapi.yaml 同源），零新增第三方。

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { load } from 'js-yaml';

const COMPOSE_FILE = 'docker-compose.yml';
const DOCKERFILE = 'Dockerfile';
const RESIDENCY_MODULE = 'dist/apps/api/src/config/data-residency.js';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const BOLD = wrap('\x1b[1m');
const RST = wrap('\x1b[0m');

const failures: string[] = [];
const ok = (msg: string) => console.log(`${GREEN}✓${RST} ${msg}`);
const bad = (msg: string) => {
  console.log(`${RED}✗ ${msg}${RST}`);
  failures.push(msg);
};

console.log(`${BOLD}── Verify compose contract (declarations) ──${RST}`);

type ComposeShape = {
  services?: Record<string, { environment?: string[] | Record<string, string> } | undefined>;
};

let appEnv: Record<string, string>;
let dockerfileText: string;
try {
  const compose = load(readFileSync(COMPOSE_FILE, 'utf8')) as ComposeShape;
  const raw = compose.services?.app?.environment;
  if (!raw) throw new Error(`${COMPOSE_FILE} 缺 services.app.environment`);
  // compose 支持 list（KEY=VALUE）与 map 两种写法，这里统一成 map
  appEnv = Array.isArray(raw)
    ? Object.fromEntries(
        raw.map((entry) => {
          const idx = entry.indexOf('=');
          return [entry.slice(0, idx), entry.slice(idx + 1)];
        }),
      )
    : { ...raw };
  dockerfileText = readFileSync(DOCKERFILE, 'utf8');
} catch (error) {
  console.log(`${RED}${BOLD}compose contract FAILED${RST} — 声明文件不可解析：${String(error)}`);
  process.exit(1);
}

let residency: {
  extractDbHost: (url: string) => string | null;
  isMainlandDbHost: (host: string, extra?: string[]) => boolean;
  resolveEnforceMode: (nodeEnv: string | undefined, override: string | undefined) => string;
};
try {
  const modUrl = `file://${path.resolve(RESIDENCY_MODULE)}`;
  residency = (await import(modUrl)) as typeof residency;
  ok(`复用产物判定函数：${RESIDENCY_MODULE}`);
} catch (error) {
  console.log(
    `${RED}${BOLD}compose contract FAILED${RST} — 无法装载 ${RESIDENCY_MODULE}（请先 pnpm run build）：${String(error)}`,
  );
  process.exit(1);
}

// ① 监听默认：镜像层必须有 HOST 且为容器语义；compose 不得双写
const hostInImage = [...dockerfileText.matchAll(/^ENV\s+HOST=(\S+)/gm)].map((m) => m[1]);
if (hostInImage.length === 0) {
  bad(`${DOCKERFILE} 未声明 ENV HOST → 容器回退代码默认 localhost，裸 docker run 发布端口恒 502`);
} else if (hostInImage.some((v) => v === 'localhost' || v === '127.0.0.1')) {
  bad(`${DOCKERFILE} 的 ENV HOST 含回环值（${hostInImage.join(', ')}），容器对外不可达`);
} else {
  ok(`${DOCKERFILE} ENV HOST=${hostInImage[hostInImage.length - 1]}（容器语义默认·单一真源）`);
}
if ('HOST' in appEnv) {
  bad('compose 仍声明 HOST：与镜像层双源，漂移风险（人裁取单一真源落 Dockerfile）');
} else {
  ok('compose 不声明 HOST（监听默认归镜像层）');
}

// ② strict 态下 DB 主机必须「白名单命中」或「被窄放行」
const mode = residency.resolveEnforceMode(appEnv.NODE_ENV, appEnv.DATA_RESIDENCY_ENFORCE);
const dbUrl = appEnv.DATABASE_URL ?? '';
const dbHost = residency.extractDbHost(dbUrl);
const extraAllowlist = (appEnv.DATA_RESIDENCY_DB_HOST_ALLOWLIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (mode !== 'strict') {
  ok(`compose 解析为 ${mode} 模式（非生产默认，无需 DB 主机放行校验）`);
} else if (!dbHost) {
  bad(`compose 的 DATABASE_URL 不可解析：${dbUrl}`);
} else if (residency.isMainlandDbHost(dbHost, extraAllowlist)) {
  const viaAllowlist = !residency.isMainlandDbHost(dbHost, []);
  ok(
    `strict 态 DB 主机 ${dbHost} 可启${viaAllowlist ? `（经窄放行 DATA_RESIDENCY_DB_HOST_ALLOWLIST=${extraAllowlist.join(',')}）` : '（内置境内白名单命中）'}`,
  );
} else {
  bad(
    `strict 态 DB 主机 ${dbHost} 既不在内置白名单也未被放行 → 出厂 compose 必抛 "outside mainland allowlist" 拒启`,
  );
}

// ③ 不得以整闸关闭换取可启动
if (appEnv.DATA_RESIDENCY_ENFORCE === 'false') {
  bad('compose 用 DATA_RESIDENCY_ENFORCE=false 关闭 PIPL 守卫换取启动（反模式·须用窄放行）');
} else {
  ok('compose 未关闭数据驻留守卫（DATA_RESIDENCY_ENFORCE 非 false）');
}

console.log('──────────────────────────');
if (failures.length > 0) {
  console.log(
    `${RED}${BOLD}compose contract FAILED${RST} — ${failures.length} 项声明不一致（部署契约自洽性）`,
  );
  process.exit(1);
}
console.log(
  `${GREEN}${BOLD}compose contract PASSED${RST} — 监听默认 / strict DB 主机放行 / 守卫未关 三面全绿`,
);
