import * as dotenv from 'dotenv';

dotenv.config();

import { pathToFileURL } from 'node:url';
import { uuidv7 } from '@core/saas-kit/shared-kernel/util/uuid-v7';
import type { EntityManager } from '@mikro-orm/core';
import * as bcrypt from 'bcryptjs';
import { Organization, User } from './mikro/entities';
import { initMikroOrm } from './mikro/orm';
import { MIKRO_APP_ENTITIES, Post } from './mikro/post.entity';

/**
 * ORM 修宪案 B · 切片 4-α（S-d6）——seed 数据面由旧 ORM 换轨为 **MikroORM**（只换通道·不改行为）。
 *
 * 保真律（对齐 §5.20 · 真库对拍校正）：
 * - **`createdAt` 靠 DB 默认（`defaultNow()`）填充**：`em.insert` 不发该列——与旧实现 一致（真库实证
 *   `user.createdAt` 有 `DEFAULT now()`·插入省略即落库为当前时间）。
 * - **`updatedAt` 必须显式写**：真库 `user/post.updatedAt` 为 `NOT NULL` 且**无 DB 默认**（旧 ORM 的
 *   `$onUpdate` 是查询构建期行为、非 DB 触发器）·故 insert 显式盖 `new Date()`（还原旧轨落库产生有效
 *   updatedAt 的可观测结果·否则 23502 NOT NULL 违约）。
 * - **`role` 文本经 PG coerced 入 enum 列**（`roleEnum('role',['USER','ADMIN'])`·沿 §5.18 `role` default 实证）；
 *   直接写 `'ADMIN'`/`'USER'` 文本，不再 `import { Role } from './schema'`（去除对旧 ORM schema 的最后一处 seed 依赖）。
 * - **`SEED_CLEANUP` / 弱口令兜底（`ADMIN_PASSWORD||admin123` · `USER_PASSWORD||user123`）逐字不变**——
 *   属 module-config-env-surface-contract 归人项，本批不夹带改 fail-loud。
 * - **运行器＝`tsx`**（`db:seed`）：seed 现值导入整条 Mikro 轨（`./mikro/orm`→`./entities`/`./four-tables`…
 *   扩展名省略），Node 原生 type-stripping **不解析扩展名省略的相对 ESM 导入**（原 `node seed.ts` 亦不例外），
 *   故改用仓内既有 `tsx` 运行（不改行为·仅换装载器·SWC 编译链不受影响）。核心逻辑抽为 `runSeed(em, options)`
 *   （供镜测直调·fake em），`main()` 只负责 dotenv（顶部先行·R-η Node-ESM 时序）→ `initMikroOrm` 懒建 app-orm
 *   （`MIKRO_APP_ENTITIES` 涵盖 User/Organization/Post）→ fork em → `runSeed` → `orm.close()`。
 */

interface SeedOptions {
  includeTestData?: boolean;
  userCount?: number;
  postCount?: number;
}

interface PostData {
  title: string;
  content: string;
  published: boolean;
}

interface UserData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

// Parse command line arguments
export function parseArgs(): SeedOptions {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    includeTestData: true,
    userCount: 2,
    postCount: 3,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--no-test-data':
        options.includeTestData = false;
        break;
      case '--users':
        if (args[i + 1]) {
          options.userCount = Number.parseInt(args[i + 1], 10);
          i++;
        }
        break;
      case '--posts':
        if (args[i + 1]) {
          options.postCount = Number.parseInt(args[i + 1], 10);
          i++;
        }
        break;
    }
  }

  return options;
}

export async function createUsers(em: EntityManager, options: SeedOptions): Promise<void> {
  console.log('👥 Creating users...');

  const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);

  // FR-13 / S5: the Platform Operator is the GLOBAL-UNIQUE cross-tenant identity, resolved by
  // the guard via DB email === platform.operatorEmail. Seed MUST guarantee that email's row
  // exists, else a non-default operator email would fail closed with no operator at all.
  const operatorEmail = process.env.PLATFORM_OPERATOR_EMAIL || 'admin@example.com';

  const existingAdmin = await em.findOne(User, { email: operatorEmail });

  if (existingAdmin) {
    // 镜像旧实现 `db.update(user).set({...}).where(eq(user.email, ...))`：原生 UPDATE·显式盖 updatedAt
    // （旧实现 `$onUpdate` 在查询构建期自动 bump updatedAt·此处如实还原该可观测行为）。
    await em.nativeUpdate(
      User,
      { email: operatorEmail },
      {
        password: adminPassword,
        name: 'Admin User',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        updatedAt: new Date(),
      },
    );
  } else {
    // `em.insert` 只发给定列·`createdAt`/`emailVerified` 省略落 DB 默认；`updatedAt` NOT NULL 无 DB 默认须显式写。
    // 类型层 Mikro 要求非空列（emailVerified/createdAt）·本 seed 刻意不写（落 DB 默认）·按本仓既有 Mikro 逃生惯用法 `as never` 收口。
    await em.insert(User, {
      id: uuidv7(),
      name: 'Admin User',
      email: operatorEmail,
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
      updatedAt: new Date(),
    } as never);
  }

  console.log(`✅ Seeded platform operator: ${operatorEmail}`);

  const userCount = options.userCount || 2;
  if (options.includeTestData && userCount > 1) {
    const userPassword = await bcrypt.hash(process.env.USER_PASSWORD || 'user123', 10);

    const usersToCreate: (UserData & { id: string; name: string; updatedAt: Date })[] = [];
    for (let i = 1; i < userCount; i++) {
      usersToCreate.push({
        id: uuidv7(),
        name: `User ${i}`,
        email: `user${i}@example.com`,
        password: userPassword,
        firstName: 'User',
        lastName: `${i}`,
        role: 'USER' as const,
        updatedAt: new Date(),
      });
    }

    if (usersToCreate.length > 0) {
      try {
        await em.insert(User, usersToCreate as never);
        console.log(`✅ Created ${usersToCreate.length} additional users`);
        for (const u of usersToCreate) console.log(`   - ${u.email}`);
      } catch (error) {
        console.error('❌ Error creating users:', error);
        throw error;
      }
    }
  }
}

export async function createPosts(em: EntityManager, options: SeedOptions): Promise<void> {
  if (!options.includeTestData) {
    console.log('⚙  Skipping posts creation (test data disabled)');
    return;
  }

  // NOT NULL tightened: every post must belong to a tenant.
  // Find an existing organization to own the seeded posts; skip if none.
  const orgs = await em.find(Organization, {}, { limit: 1 });
  const org = orgs[0];
  if (!org) {
    console.log('⚠  No organization found – skipping post seeding (create an org first)');
    return;
  }

  console.log(`📝 Creating sample posts (org=${org.id})...`);

  const orgId = org.id;

  const samplePosts: PostData[] = [
    {
      title: 'Welcome to Our Platform',
      content: 'This is the first post in our system.',
      published: true,
    },
    {
      title: 'Getting Started with NestJS',
      content: 'NestJS is a progressive Node.js framework.',
      published: true,
    },
    {
      title: 'Introduction to MikroORM',
      content: 'MikroORM is a TypeScript ORM for SQL.',
      published: false,
    },
    {
      title: 'PostgreSQL Best Practices',
      content: 'Learn how to effectively use PostgreSQL.',
      published: true,
    },
    {
      title: 'API Security Guidelines',
      content: 'Essential security practices for building secure APIs.',
      published: false,
    },
  ];

  const postsToCreate = samplePosts.slice(0, options.postCount || 3);

  if (postsToCreate.length > 0) {
    try {
      await em.insert(
        Post,
        postsToCreate.map((p) => ({
          id: uuidv7(),
          organizationId: orgId,
          updatedAt: new Date(),
          ...p,
        })) as never,
      );
      console.log(`✅ Created ${postsToCreate.length} posts`);
      for (const p of postsToCreate) console.log(`   - ${p.title}`);
    } catch (error) {
      console.error('❌ Error creating posts:', error);
      throw error;
    }
  }
}

export async function cleanup(em: EntityManager): Promise<void> {
  if (process.env.SEED_CLEANUP === 'true') {
    console.log('🧹 Cleaning up existing data...');
    try {
      // 全表删·删序 post→user（post FK 引用 user·先删子表·与旧实现 `db.delete` 一致）。
      await em.nativeDelete(Post, {});
      await em.nativeDelete(User, {});
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      throw error;
    }
  }
}

/** seed 三段编排（可注入 em·供镜测直调）：cleanup → createUsers → createPosts。 */
export async function runSeed(em: EntityManager, options: SeedOptions): Promise<void> {
  await cleanup(em);
  await createUsers(em, options);
  await createPosts(em, options);
}

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('🌱 Starting database seeding...');
  console.log('📋 Seed options:', options);

  const orm = await initMikroOrm(process.env.DATABASE_URL as string, MIKRO_APP_ENTITIES);
  try {
    await runSeed(orm.em.fork(), options);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Database seeding completed successfully in ${duration}s!`);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'Unknown error');
    throw error;
  } finally {
    await orm.close();
  }
}

// 入口守卫：仅当被 `node .../seed.ts`（`db:seed`）直接执行时才跑 main；被单测 import 时不触发 DB 连接。
const isDirectRun =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  });
}
