/**
 * ORM 修宪案 B · 切片 3a —— **真库基线登记**（高危清单 1·须人一次性签核·本次已获授权）。
 *
 * 做的事（对已存在现网 schema 的库做「基线登记」，**非**重放建表）：
 *  1) 目标库名护栏：`MIKRO_BASELINE_APPLY` 必须逐等 DATABASE_URL 解析出的 dbName，否则拒执。
 *  2) 只读预检：`migrator.checkSchema()` 比对「现网 schema ↔ init snapshot」。
 *     - 返 true（有漂移）→ 打印 diff 线索并**中止（EXIT=2）**，绝不登记。
 *     - 返 false（一致）→ 继续。
 *  3) 基线登记：`migrator.logMigration(name)`——把 init 迁移记为已执行，**不跑其 CREATE DDL**，
 *     只建/写 `mikro_migrations` 一张记账表·**零数据表 DDL**。
 *  4) 核验：`getExecuted()` 含该条 · `getPending()` 空 · 13 数据表行数登记前后不变。
 *
 * 回滚（零数据表影响）：`migrator.unlogMigration(name)` 或 `drop table mikro_migrations`。
 *
 * 运行：`MIKRO_BASELINE_APPLY=nestjs_practice bun scripts/mikro-baseline-apply.ts`
 */
import postgres from 'postgres';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const MIGRATION_NAME = 'Migration20261016055354';
const EXPECTED_TABLES = [
  'account',
  'consent',
  'event',
  'invitation',
  'member',
  'organization',
  'post',
  'session',
  'tenant_subscription',
  'user',
  'user_status',
  'verification',
  'workspace',
];

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');
const dbName = new URL(url).pathname.replace(/^\//, '');
const confirm = process.env.MIKRO_BASELINE_APPLY;
if (confirm !== dbName) {
  console.error(
    `REFUSED: MIKRO_BASELINE_APPLY='${confirm ?? ''}' != resolved dbName='${dbName}'. ` +
      `目标库未逐等确认，拒绝执行高危登记。`,
  );
  process.exit(3);
}

async function rowCountMap(): Promise<Record<string, number>> {
  const sql = postgres(url!, { max: 1 });
  const out: Record<string, number> = {};
  for (const t of EXPECTED_TABLES) {
    const r = await sql.unsafe(`select count(*)::int c from "${t}"`);
    out[t] = r[0].c as number;
  }
  await sql.end();
  return out;
}

const orm = await initMigrationOrm(url);
console.log(`[target] db=${dbName}  migration=${MIGRATION_NAME}`);

// (2) 只读预检
const drifted = await orm.migrator.checkSchema();
console.log(`[precheck] checkSchema (true=漂移/false=一致) => ${drifted}`);
if (drifted) {
  console.error('DRIFT DETECTED：现网 schema 与 init snapshot 不一致，中止登记（不强登）。');
  console.error('请人工核对差异来源（可能是 push 漂移/额外列/类型），归人后再判。');
  await orm.close();
  process.exit(2);
}

const before = await rowCountMap();

// (3) 基线登记（仅写 mikro_migrations 记账表·零数据表 DDL）
await orm.migrator.logMigration(MIGRATION_NAME);
console.log(`[apply] logMigration('${MIGRATION_NAME}') done`);

// (4) 核验
const executed = await orm.migrator.getExecuted();
const pending = await orm.migrator.getPending();
const after = await rowCountMap();
console.log(
  `[verify] executed=${JSON.stringify(executed.map((e) => e.name))} pending=${JSON.stringify(pending.map((p) => p.name))}`,
);

const drift = EXPECTED_TABLES.filter((t) => before[t] !== after[t]);
await orm.close();

let bad = !executed.some((e) => e.name === MIGRATION_NAME);
if (pending.length > 0) {
  console.error(`PENDING not empty after baseline: ${pending.map((p) => p.name).join(', ')}`);
  bad = true;
}
if (drift.length > 0) {
  console.error(
    `ROW COUNT CHANGED (应为零数据表影响): ${drift.map((t) => `${t}:${before[t]}→${after[t]}`).join(', ')}`,
  );
  bad = true;
} else {
  console.log(
    `[verify] 13 表行数登记前后完全不变（零数据表影响）：${EXPECTED_TABLES.map((t) => `${t}=${after[t]}`).join(' ')}`,
  );
}

console.log(
  bad
    ? '\n=== 核验失败·见上（可 unlogMigration/drop mikro_migrations 回滚）==='
    : '\n=== 基线登记成功·现网已纳入 Mikro 迁移链·drizzle/ 冻结保留 ===',
);
process.exit(bad ? 1 : 0);
