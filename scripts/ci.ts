// 本地 CI 编排器 —— 在开发者机器上一次跑完全部质量门禁，替代远程 CI。
// 硬性门禁（lint → build → test）快速失败；fallow 仅作佐证（其结论须二次人工
// 核验，见 docs/specs/tooling-standards.md §4.7），任何情况下都不使流水线失败。
// 触发：手动 `bun run ci`，或 push 时由 .husky/pre-push 自动执行。

import { $ } from 'bun';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (color ? code : '');
const GREEN = wrap('\x1b[32m');
const RED = wrap('\x1b[31m');
const YELLOW = wrap('\x1b[33m');
const BOLD = wrap('\x1b[1m');
const DIM = wrap('\x1b[2m');
const RST = wrap('\x1b[0m');

let failed = 0;

type Step = () => Promise<{ exitCode: number | null }>;

async function step(name: string, run: Step): Promise<void> {
  console.log(`${BOLD}▶ ${name}${RST}`);
  const { exitCode } = await run();
  if (exitCode === 0) {
    console.log(`${GREEN}✓ ${name} passed${RST}\n`);
  } else {
    console.log(`${RED}✗ ${name} failed (exit ${exitCode})${RST}\n`);
    failed = 1;
  }
}

console.log(`${BOLD}── Local CI ──${RST}`);
console.log(`${DIM}Bun ${Bun.version} · ${new Date().toLocaleString()}${RST}\n`);

await step('Lint & format (biome)', () => $`bun run check`.nothrow());
await step('Build & typecheck (nest + swc)', () => $`bun run build:nest`.nothrow());
await step('Tests (vitest)', () => $`bun run test`.nothrow());

// 佐证（advisory）：fallow 架构边界。工具未安装/报错也不阻断本地 CI。
console.log(`${BOLD}── Advisory (fallow) ──${RST}`);
console.log(`${BOLD}▶ architecture boundaries${RST}`);
const arch = await $`bunx fallow architecture`.nothrow();
if (arch.exitCode === 0) {
  console.log(`${GREEN}✓ no boundary violations${RST}\n`);
} else if (arch.exitCode === 1) {
  console.log(`${YELLOW}⚠ fallow findings — advisory only, verify manually (§4.7)\n${RST}`);
} else {
  console.log(`${YELLOW}⚠ fallow unavailable/error (exit ${arch.exitCode}) — skipped\n${RST}`);
}

console.log('──────────────────────────');
if (failed) {
  console.log(`${RED}${BOLD}Local CI FAILED${RST}`);
  process.exit(1);
}
console.log(`${GREEN}${BOLD}Local CI PASSED${RST}`);
