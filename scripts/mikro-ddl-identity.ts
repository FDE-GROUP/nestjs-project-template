/**
 * ORM 修宪案 B · 切片 3c-ii —— 迁移实体 **DDL 恒等闸**（scratch-only·绝不碰 nestjs_practice/生产）。
 *
 * 用途（γ 抽列元数据单一源重构的安全前置·高危清单 1）：证明「四表迁移实体经工厂重建后·其
 * 元数据反推的 DDL 与重构前逐行恒等」——即「已登记基线 `Migration20261016055354` 仍与实体
 * 一致」，故重构不动迁移链、不产生漂移。
 *
 * 机理：把 Drizzle SQL 应用到一次性 scratch 库，再问 Mikro「要把该库对齐到实体元数据需发哪些
 * DDL」（`getUpdateSchemaSQL`）。该输出含 Drizzle⇄Mikro FK **约束命名差异**（恒定噪声·非真
 * 实 schema 漂移）——故本闸不取「零漂移」，而取「重构前/后输出归一排序后逐行相同」。
 *
 * 用法：`bun scripts/mikro-ddl-identity.ts write`（当前实体→生成 golden）·
 *   `bun scripts/mikro-ddl-identity.ts check`（重跑与 golden 比对·不同则退出码 1）。
 * golden 文件：`scripts/mikro-ddl-golden.sql`（已入库·代表基线实体面）。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const BASE = process.env.DATABASE_URL;
if (!BASE) throw new Error('DATABASE_URL missing');

const base = new URL(BASE);
const ADMIN_URL = `${base.protocol}//${base.username}:${base.password}@${base.hostname}:${base.port || 5432}/postgres`;
const dbUrl = (name: string) =>
  `${base.protocol}//${base.username}:${base.password}@${base.hostname}:${base.port || 5432}/${name}`;

const REF = 'mikro_idl_ref';

async function recreate(name: string) {
  const admin = postgres(ADMIN_URL, { max: 1 });
  await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${name} and pid <> pg_backend_pid()`;
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();
}

async function adminDrop(name: string) {
  const admin = postgres(ADMIN_URL, { max: 1 });
  await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${name} and pid <> pg_backend_pid()`;
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
}

async function applyDrizzle(url: string) {
  const sql = postgres(url, { max: 1 });
  const dir = new URL('../drizzle', import.meta.url).pathname;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    const body = readFileSync(`${dir}/${f}`, 'utf8');
    for (const stmt of body.split('--> statement-breakpoint')) {
      const t = stmt.trim();
      if (t) await sql.unsafe(t);
    }
  }
  await sql.end();
}

const GOLDEN = new URL('./mikro-ddl-golden.sql', import.meta.url).pathname;
const MODE = process.argv[2] ?? 'check';

/** 归一：拆句·去空白/注释前言·折叠空白·排序，得可跨次稳定比对的语句集。 */
function normalize(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && !s.toLowerCase().startsWith('set names') && !s.startsWith('--'))
    .sort();
}

async function captureNormalized(): Promise<string[]> {
  await recreate(REF);
  await applyDrizzle(dbUrl(REF));
  const orm = await initMigrationOrm(dbUrl(REF));
  // 把实体元数据对齐到已建好的 Drizzle 权威库：需要发的 DDL（含恒定 FK 命名噪声）。
  const sql = await orm.schema.getUpdateSchemaSQL();
  await orm.close();
  await adminDrop(REF);
  return normalize(sql);
}

async function main() {
  const current = await captureNormalized();
  if (MODE === 'write') {
    writeFileSync(GOLDEN, current.join('\n') + '\n');
    console.log(`[golden] 已写入 ${current.length} 条归一 DDL 语句 → ${GOLDEN}`);
    process.exit(0);
  }

  let golden: string[];
  try {
    golden = readFileSync(GOLDEN, 'utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    console.log('=== golden 缺失·先跑 `write` 以当前实体生成基线 ===');
    process.exit(2);
  }

  const onlyCur = current.filter((x) => !golden.includes(x));
  const onlyGol = golden.filter((x) => !current.includes(x));
  if (onlyCur.length === 0 && onlyGol.length === 0) {
    console.log(`=== DDL 恒等：重构后迁移实体与 golden 逐行相同（${current.length} 条·PASS）===`);
    process.exit(0);
  }
  console.log(`=== 漂移：实体元数据与 golden 不一致（FAIL·停下上报）===`);
  for (const s of onlyCur) console.log(`  + 新仅现: ${s}`);
  for (const s of onlyGol) console.log(`  - 仅 golden: ${s}`);
  process.exit(1);
}

await main();
