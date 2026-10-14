// 生产启动回归防线——把 S0/S4 的「手工两运行时起服存照」固化为可重跑门禁。
// 缘起 R-δ / plan §4.8：**CI 绿 ≠ prod 起服可跑**（Vitest 经 tsconfigPaths 把裸句柄即时解析回
// TS 源，掩盖了编译产物的真实可解析性）；唯「真起服 + 命中 /health」实证能戳穿。本脚本用
// **Node** 起编译产物 `dist/apps/api/src/main.js`，轮询 `/api/v1/health` 至 200 或超时，
// 失败即 exit 1。前置：先 `pnpm run build` 产出 dist、且 Postgres 已就绪（/health 经 terminus
// 探库）。触发：`pnpm run verify:prod-boot`。
//
// 注：本防线只验「Node 能否加载并装配编译产物」这一 runtime/module-resolution 面（R-δ），
// 与 `NODE_ENV` 部署档正交——故**继承调用方环境**（不强制 production），避免把数据驻留
// 守卫（strict 仅随 NODE_ENV=production 生效·需境内存储凭证）这一无关关切误判为起服失败。
//
// 运行时=Node（弃 Bun）：node:child_process + 全局 fetch（Node ≥22 内建），无第三方依赖。

import { spawn } from 'node:child_process';

const PORT = Number(process.env.VERIFY_PORT ?? 7099);
const ENTRY = 'dist/apps/api/src/main.js';
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/v1/health`;
const DEADLINE_MS = Number(process.env.VERIFY_TIMEOUT_MS ?? 30_000);
const POLL_MS = 500;

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const BOLD = wrap('\x1b[1m');
const DIM = wrap('\x1b[2m');
const RST = wrap('\x1b[0m');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

console.log(`${BOLD}── Verify prod boot ──${RST}`);
console.log(`${DIM}entry=${ENTRY} · node ${process.version} · ${HEALTH_URL}${RST}\n`);

const child = spawn(process.execPath, [ENTRY], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'inherit', 'inherit'],
});

let exitCode: number | null = null;
child.on('exit', (code) => {
  exitCode = code;
});

function stop(): void {
  if (exitCode === null && !child.killed) child.kill('SIGTERM');
}

async function waitHealthy(): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < DEADLINE_MS) {
    if (exitCode !== null) {
      console.log(`${RED}✗ server process exited early (code ${exitCode})${RST}`);
      return false;
    }
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = (await res.json()) as { data?: { status?: string } };
        console.log(`${GREEN}✓ /health ${res.status} · ${JSON.stringify(body.data ?? body)}${RST}`);
        return true;
      }
    } catch {
      // 未就绪：服务尚未 listen 或依赖尚在装配，继续轮询。
    }
    await sleep(POLL_MS);
  }
  console.log(`${RED}✗ /health not 200 within ${DEADLINE_MS}ms${RST}`);
  return false;
}

const ok = await waitHealthy();
stop();

console.log('──────────────────────────');
if (!ok) {
  console.log(`${RED}${BOLD}prod boot FAILED${RST} — 编译产物无法真起服（回归防线触发）`);
  process.exit(1);
}
console.log(`${GREEN}${BOLD}prod boot PASSED${RST} — node 起编译产物命中 /health 200`);
