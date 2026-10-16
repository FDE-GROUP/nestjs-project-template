/**
 * 全栈 CI 拼 PG（[global-ci-fullstack-pg] 切片 A）—— Testcontainers 一次性真库编排器。
 *
 * 流程（审计裁点 甲=Testcontainers·乙=postgres:16-alpine·丁=一容器双库）：
 *   拉起一次性 PG 容器（随机宿主端口，不与在跑 dev 库相撞）
 *   → `createdb` 第二库 `mikro_ba_consistency`（名恒 `auth-adapter.consistency.spec.ts` 的
 *     `assertScratchDb` 安全断言·防误指真实库的原前置原样生效）
 *   → 两库各**重放已提交基线迁移**（`initMigrationOrm` + `migrator.up()`·与 `db:setup` 同路径·
 *     永不 `schema.create/synchronize`，守 tooling §4「generate+migrate」纪律）
 *   → 跑 6 个 env-gated 全栈 e2e（`DATABASE_URL`=`E2E_DATABASE_URL`=ci_e2e 容器串·现契约两变量同指一库）
 *   → 跑 BA authFlow 一致性套件（`DATABASE_URL`=mikro_ba_consistency 串 + `BA_MIKRO_CONSISTENCY=1`）
 *   → `finally` 显式 `container.stop()`——用完即焚、零足迹（§4.10 实跑对拍口径）。
 *
 * Ryuk 不引（镜像境内 pull 风险·plan §3 风险-1）：清理兜底 = finally stop + 启动前按
 * `org.testcontainers.{true,lang=node}` 标签 × 本镜像 × `exited` 清扫遗留（不碰运行中/他人容器）。
 *
 * 运行器 = `tsx`（沿 `mikro-migrate.ts`/`seed.ts` 先例：值导入 `.ts` 后缀迁移装配，
 * Node 原生 type-stripping 不解析省略扩展名的相对 ESM 导入·R-η）。
 * 入口：`pnpm run test:fullstack`（或经 `ci:db`）；**不入默认 `ci`/`ci:quick`/`pre-push`**——
 * 默认 CI 的 DB-free 不变量不动（gated e2e 无 env 时仍 `describe.skip`，本脚本只负责供 env 与库）。
 */
import { spawnSync } from 'node:child_process';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const IMAGE = 'postgres:16-alpine';
const E2E_DB = 'ci_e2e';
const CONSISTENCY_DB = 'mikro_ba_consistency';

/** 现存 6 个 env-gated 真库 e2e（`E2E_DATABASE_URL` 开关）——新增 gated 文件时此处同步登记。 */
const GATED_E2E_FILES = [
  'apps/api/src/modules/posts/infrastructure/repositories/posts-cursor-pagination.e2e.test.ts',
  'apps/api/src/database/event-store.mikro.e2e.test.ts',
  'apps/api/src/tenancy/tenant-hard-delete.e2e.test.ts',
  'apps/api/src/tenancy/tenant-isolation.e2e.test.ts',
  'apps/api/src/modules/auth/auth-http-surface.e2e.test.ts',
  'apps/api/src/tenancy/seat-quota-member.e2e.test.ts',
];

// Ryuk 禁用（见头注）；容器清理走 finally stop + 启动前遗留清扫。
process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

function docker(...args: string[]): string {
  const res = spawnSync('docker', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(
      `docker ${args.join(' ')} failed: ${(res.stderr ?? '').trim() || 'unknown error'}`,
    );
  }
  return res.stdout ?? '';
}

// 尽力清扫历史崩溃遗留的一次性容器（仅 testcontainers-node 产物 × 本镜像 × 已退出）；
// docker 不可用时不在此崩——紧随的容器 start 会 fail-loud 点名根因。
try {
  const stale = docker(
    'ps',
    '-aq',
    '--filter',
    'label=org.testcontainers=true',
    '--filter',
    'label=org.testcontainers.lang=node',
    '--filter',
    `ancestor=${IMAGE}`,
    '--filter',
    'status=exited',
  ).trim();
  if (stale) {
    console.log(
      `[ci-fullstack] sweeping stale one-shot containers: ${stale.split('\n').join(' ')}`,
    );
    docker('rm', ...stale.split('\n'));
  }
} catch (err) {
  console.warn(
    `[ci-fullstack] stale sweep skipped (container start will fail-loud if docker missing): ${String(err)}`,
  );
}

let failed = 0;
let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined;

try {
  console.log(
    `[ci-fullstack] starting one-shot ${IMAGE} (databases: ${E2E_DB} + ${CONSISTENCY_DB})...`,
  );
  container = await new PostgreSqlContainer(IMAGE)
    .withDatabase(E2E_DB)
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  // 第二库经容器内 unix socket（官方镜像 auth-local=trust）——免密码、免重启容器。
  const createdb = await container.exec(['sh', '-c', `createdb -U postgres ${CONSISTENCY_DB}`]);
  if (createdb.exitCode !== 0) {
    throw new Error(
      `createdb ${CONSISTENCY_DB} failed (exit ${createdb.exitCode}): ${createdb.output?.trim() ?? 'no output'}`,
    );
  }

  const base = `postgres://postgres:postgres@${container.getHost()}:${container.getPort()}`;
  const e2eUrl = `${base}/${E2E_DB}`;
  const consistencyUrl = `${base}/${CONSISTENCY_DB}`;

  for (const url of [e2eUrl, consistencyUrl]) {
    const orm = await initMigrationOrm(url);
    try {
      const applied = await orm.migrator.up();
      console.log(
        `[ci-fullstack] baseline replayed on ${new URL(url).pathname.slice(1)} (${applied.length} migration(s))`,
      );
    } finally {
      await orm.close();
    }
  }

  function run(label: string, args: string[], env: Record<string, string>): number {
    console.log(`\n[ci-fullstack] ▶ ${label}`);
    const res = spawnSync('pnpm', args, { stdio: 'inherit', env: { ...process.env, ...env } });
    const code = res.status ?? 1;
    console.log(`[ci-fullstack] ${code === 0 ? '✓' : '✗'} ${label} (exit ${code})`);
    return code;
  }

  failed |= run(
    'env-gated 全栈 e2e（6 文件·真容器真库）',
    ['exec', 'vitest', 'run', ...GATED_E2E_FILES],
    {
      DATABASE_URL: e2eUrl,
      E2E_DATABASE_URL: e2eUrl,
    },
  );
  failed |= run(
    'BA authFlow 一致性套件（assertScratchDb 库名恒等满足）',
    ['exec', 'vitest', 'run', '--config', 'vitest.consistency.config.ts'],
    {
      DATABASE_URL: consistencyUrl,
      BA_MIKRO_CONSISTENCY: '1',
    },
  );
} finally {
  if (container) {
    await container.stop();
    console.log('[ci-fullstack] one-shot container stopped (零足迹)');
  }
}

process.exit(failed === 0 ? 0 : 1);
