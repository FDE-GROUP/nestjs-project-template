/**
 * ORM 修宪案 B · 切片 4（contract）——**MikroORM 迁移运行器**（旧 ORM 退场后 `db:setup`/`db:reset` 的正解）。
 *
 * 连 `DATABASE_URL`，应用 `apps/api/src/database/mikro/migration/migrations` 下**未执行**的迁移
 * （基线 `Migration20261016055354` + snapshot·由 `mikro-migration.config.ts` 的迁移专用装配驱动）。
 *
 * - 默认（幂等）：`migrator.up()`——已登记基线则 0 应用，新库则重放建表。
 * - `--fresh`：先 `schema.drop({ dropMigrationsTable: true })` 删全部实体表 + 迁移台账（`mikro_migrations`），
 *   再 `migrator.up()` 重放——等价旧 `migration:run --fresh` 的**破坏性 dev 重建**语义。**切勿指向生产/现网库**
 *   （生产只走增量 `up`·见 tooling §4「generate+migrate」纪律·此处仅执行已提交迁移工件）。
 *
 * 运行器＝`tsx`（沿 `db:seed` 先例：本脚本值导入 `.ts` 后缀的迁移装配，Node 原生 type-stripping
 * 不解析扩展名省略的相对 ESM 导入·见 seed.ts 头注 R-η）。
 */
// 先载 .env（与 main.ts / seed.ts 同源单例 load-env）：裸终端跑 db:setup/db:reset 时 DATABASE_URL 由此注入。
import '../apps/api/src/load-env.ts';
import { initMigrationOrm } from '../apps/api/src/database/mikro/migration/mikro-migration.config.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const dbName = new URL(url).pathname.replace(/^\//, '');
const fresh = process.argv.includes('--fresh');
const orm = await initMigrationOrm(url);

try {
  console.log(`[mikro-migrate] db=${dbName} mode=${fresh ? 'fresh' : 'up'}`);

  if (fresh) {
    // 删全部实体表 + 迁移台账（幂等·introspect 后只 drop 存在者），令基线 init 迁移可重放。
    await orm.schema.drop({ dropMigrationsTable: true });
    console.log('[mikro-migrate] dropped existing schema + migration ledger');
  }

  const applied = await orm.migrator.up();
  if (applied.length === 0) {
    console.log('✅ migrations up to date (0 applied)');
  } else {
    for (const info of applied) {
      console.log(`✅ applied: ${info.name}`);
    }
    console.log(`✅ ${applied.length} migration(s) applied`);
  }
} finally {
  await orm.close();
}
