/**
 * ORM 修宪案 B · 切片 3a —— 迁移基线**离线对拍工具**（scratch-only·绝不碰常驻 dev/生产库）。
 *
 * 干的事：
 *  1) 在 dev PG 服务器上建两个一次性 scratch 库 `mikro_bl_baseline`（Mikro 生成）/ `mikro_bl_ref`（Drizzle 现 schema 复刻）。
 *  2) Mikro：init 迁移专用实体集 → `migrator.createInitial()` 生成 init 迁移文件 + snapshot（落 migrations/）并确保 schema 建好。
 *  3) Drizzle：按序执行已提交 `drizzle/*.sql`（现生产表面权威定义）到 ref 库。
 *  4) 对两库 `public` 做**结构级信息模式对拍**：表 / 列(类型·可空·默认) / PK / 唯一 / 普通索引 / FK(列→引用表.列 删规则)。
 *  5) 打印逐表 PASS/FAIL + 差异明细；非零退出码 = 漂移；收尾 DROP 两 scratch 库。
 *
 * 运行：`bun scripts/mikro-migration-baseline.ts`（bun 直解 extensionless TS import）。
 * ⚠ 高危清单 1：本工具只建/删 scratch 库做验证，**不对 nestjs_practice/生产库执行任何 DDL**。
 */
import { readdirSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const BASE = process.env.DATABASE_URL;
if (!BASE) throw new Error('DATABASE_URL missing');

const base = new URL(BASE);
const ADMIN_URL = `${base.protocol}//${base.username}:${base.password}@${base.hostname}:${base.port || 5432}/postgres`;
const dbUrl = (name: string) =>
  `${base.protocol}//${base.username}:${base.password}@${base.hostname}:${base.port || 5432}/${name}`;

const BL = 'mikro_bl_baseline';
const REF = 'mikro_bl_ref';

const EXPECTED_TABLES = [
  'account',
  'consent',
  'event',
  'invitation',
  'member',
  'organization',
  'post',
  'session',
  'user',
  'user_status',
  'tenant_subscription',
  'verification',
  'workspace',
].sort();

async function recreate(name: string) {
  const admin = postgres(ADMIN_URL, { max: 1 });
  await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${name} and pid <> pg_backend_pid()`;
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();
}

/** 归一列默认：now()/CURRENT_TIMESTAMP → 'now'；nextval(...) → '<seq>'；其余去类型 cast 后缀。 */
function normDefault(d: string | null): string {
  if (!d) return '';
  if (/^nextval\(/.test(d)) return '<seq>';
  if (d === 'now()' || d === 'CURRENT_TIMESTAMP') return 'now';
  return d.replace(/::[a-z_ ]+$/, '').replace(/^'(.*)'$/, "'$1'");
}

/** 归一 PG 列类型：`timestamp without time zone` → timestamp；with → timestamptz。 */
function normType(t: string): string {
  if (t === 'timestamp without time zone') return 'timestamp';
  if (t === 'timestamp with time zone') return 'timestamptz';
  return t;
}

interface Shape {
  tables: Set<string>;
  cols: Map<string, Map<string, { type: string; null: string; def: string }>>;
  pk: Map<string, string>;
  uniq: Map<string, Set<string>>;
  idx: Map<string, Set<string>>;
  fk: Map<string, Set<string>>;
}

async function introspect(url: string): Promise<Shape> {
  const sql = postgres(url, { max: 1 });
  const s: Shape = {
    tables: new Set(),
    cols: new Map(),
    pk: new Map(),
    uniq: new Map(),
    idx: new Map(),
    fk: new Map(),
  };

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'`;
  for (const r of tables) s.tables.add(r.table_name as string);

  const cols = await sql`
    select table_name t, column_name c, data_type dt, is_nullable n, coalesce(column_default,'') d
    from information_schema.columns where table_schema='public'`;
  for (const r of cols) {
    if (!s.cols.has(r.t)) s.cols.set(r.t, new Map());
    s.cols.get(r.t)!.set(r.c, {
      type: normType(r.dt as string),
      null: r.n as string,
      def: normDefault(r.d as string),
    });
  }

  const idxRows = await sql`
    select c1.relname t, i.indisunique u, i.indisprimary p,
      (select string_agg(a.attname, ',' order by x.ord)
         from unnest(i.indkey) with ordinality x(attnum, ord)
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = x.attnum and x.attnum > 0) cols
    from pg_index i
    join pg_class c1 on c1.oid = i.indrelid and c1.relkind = 'r'
    join pg_namespace n on n.oid = c1.relnamespace
    where n.nspname = 'public'`;
  for (const r of idxRows) {
    if (r.p) s.pk.set(r.t, r.cols as string);
    else if (r.u) {
      if (!s.uniq.has(r.t)) s.uniq.set(r.t, new Set());
      s.uniq.get(r.t)!.add(r.cols as string);
    } else {
      if (!s.idx.has(r.t)) s.idx.set(r.t, new Set());
      s.idx.get(r.t)!.add(r.cols as string);
    }
  }

  const delMap: Record<string, string> = {
    c: 'cascade',
    n: 'set null',
    d: 'set default',
    r: 'restrict',
    a: 'no action',
  };
  const fkRows = await sql`
    select cl.relname t,
      (select string_agg(a.attname, ',' order by x.ord)
         from unnest(f.conkey) with ordinality x(attnum, ord)
         join pg_attribute a on a.attrelid = f.conrelid and a.attnum = x.attnum) cols,
      rf.relname rt,
      (select string_agg(a.attname, ',' order by x.ord)
         from unnest(f.confkey) with ordinality x(attnum, ord)
         join pg_attribute a on a.attrelid = f.confrelid and a.attnum = x.attnum) refcols,
      f.confdeltype del,
      f.confupdtype upd
    from pg_constraint f
    join pg_class cl on cl.oid = f.conrelid
    join pg_class rf on rf.oid = f.confrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where f.contype = 'f' and n.nspname = 'public'`;
  for (const r of fkRows) {
    if (!s.fk.has(r.t)) s.fk.set(r.t, new Set());
    // update rule 'a'(NO ACTION) 为 PG 缺省·Drizzle 不显式写·故仅在非默认时纳入比较。
    const up = r.upd === 'a' ? '' : `/${delMap[r.upd] ?? r.upd}`;
    s.fk.get(r.t)!.add(`${r.cols}->${r.rt}.${r.refcols}:${delMap[r.del] ?? r.del}${up}`);
  }

  await sql.end();
  return s;
}

function setDiff<T>(a: Set<T>, b: Set<T>) {
  return { onlyA: [...a].filter((x) => !b.has(x)), onlyB: [...b].filter((x) => !a.has(x)) };
}

function compareTable(name: string, bl: Shape, ref: Shape): string[] {
  const diffs: string[] = [];
  const blCols = bl.cols.get(name) ?? new Map();
  const refCols = ref.cols.get(name) ?? new Map();
  const allCol = [...new Set([...blCols.keys(), ...refCols.keys()])].sort();
  for (const c of allCol) {
    const b = blCols.get(c);
    const r = refCols.get(c);
    if (!b) diffs.push(`col ${c}: MISSING-in-Mikro (ref ${r?.type} null=${r?.null} def=${r?.def})`);
    else if (!r) diffs.push(`col ${c}: EXTRA-in-Mikro (${b.type})`);
    else if (b.type !== r.type) diffs.push(`col ${c}: type Mikro=${b.type} vs Drizzle=${r.type}`);
    else if (b.null !== r.null)
      diffs.push(`col ${c}: nullable Mikro=${b.null} vs Drizzle=${r.null}`);
    else if (b.def !== r.def)
      diffs.push(`col ${c}: default Mikro='${b.def}' vs Drizzle='${r.def}'`);
  }
  const pk = setDiff(new Set([bl.pk.get(name)]), new Set([ref.pk.get(name)]));
  if (pk.onlyA[0]) diffs.push(`PK Mikro-only ${pk.onlyA[0]}`);
  if (pk.onlyB[0]) diffs.push(`PK Drizzle-only ${pk.onlyB[0]}`);
  for (const key of ['uniq', 'idx', 'fk'] as const) {
    const d = setDiff(bl[key].get(name) ?? new Set(), ref[key].get(name) ?? new Set());
    for (const o of d.onlyA) diffs.push(`${key} Mikro-only: ${o}`);
    for (const o of d.onlyB) diffs.push(`${key} Drizzle-only: ${o}`);
  }
  return diffs;
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

async function main() {
  await recreate(BL);
  await recreate(REF);

  const orm = await initMigrationOrm(dbUrl(BL));
  const result = await orm.migrator.createInitial();
  console.log(`[mikro] init migration file: ${result.fileName}`);
  // createInitial 生成 init 迁移文件；scratch 内跑 up() 让物理表建好以供 introspect（非真库）。
  await orm.migrator.up();
  await orm.close();

  await applyDrizzle(dbUrl(REF));

  const bl = await introspect(dbUrl(BL));
  const ref = await introspect(dbUrl(REF));

  // 表集对拍（排除 Mikro 迁移记账表 mikro_migrations）。
  const blTables = [...bl.tables].filter((t) => t !== 'mikro_migrations').sort();
  const refTables = [...ref.tables].sort();
  console.log(`\n[table] Mikro: ${blTables.join(', ')}`);
  console.log(`[table] Drizzle: ${refTables.join(', ')}`);
  const tblDiff = setDiff(new Set(blTables), new Set(refTables));
  let bad = false;
  if (tblDiff.onlyA.length) {
    console.log(`[table] EXTRA-in-Mikro: ${tblDiff.onlyA.join(', ')}`);
    bad = true;
  }
  if (tblDiff.onlyB.length) {
    console.log(`[table] MISSING-in-Mikro: ${tblDiff.onlyB.join(', ')}`);
    bad = true;
  }

  for (const name of EXPECTED_TABLES) {
    const diffs = compareTable(name, bl, ref);
    if (diffs.length === 0) {
      console.log(`PASS  ${name}`);
    } else {
      bad = true;
      console.log(`FAIL  ${name}`);
      for (const d of diffs) console.log(`        - ${d}`);
    }
  }

  await adminDrop(BL);
  await adminDrop(REF);

  console.log(bad ? '\n=== 漂移：见上 ===' : '\n=== 全部忠实·无漂移 ===');
  process.exit(bad ? 1 : 0);
}

async function adminDrop(name: string) {
  const admin = postgres(ADMIN_URL, { max: 1 });
  await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${name} and pid <> pg_backend_pid()`;
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.end();
}

await main();
