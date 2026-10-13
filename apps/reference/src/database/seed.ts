import * as dotenv from 'dotenv';

dotenv.config();

import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { post, Role, user } from './schema';

const client = postgres(process.env.DATABASE_URL as string);
const db = drizzle(client, { schema: { user, post } });

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
function parseArgs(): SeedOptions {
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

async function createUsers(options: SeedOptions) {
  console.log('👥 Creating users...');

  const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);

  // FR-13 / S5: the Platform Operator is the GLOBAL-UNIQUE cross-tenant identity, resolved by
  // the guard via DB email === platform.operatorEmail. Seed MUST guarantee that email's row
  // exists, else a non-default operator email would fail closed with no operator at all.
  const operatorEmail = process.env.PLATFORM_OPERATOR_EMAIL || 'admin@example.com';

  const existingAdmin = await db.query.user.findFirst({
    where: eq(user.email, operatorEmail),
  });

  if (existingAdmin) {
    await db
      .update(user)
      .set({
        password: adminPassword,
        name: 'Admin User',
        firstName: 'Admin',
        lastName: 'User',
        role: Role.ADMIN,
      })
      .where(eq(user.email, operatorEmail));
  } else {
    await db.insert(user).values({
      id: randomUUID(),
      name: 'Admin User',
      email: operatorEmail,
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
    });
  }

  console.log(`✅ Seeded platform operator: ${operatorEmail}`);

  const userCount = options.userCount || 2;
  if (options.includeTestData && userCount > 1) {
    const userPassword = await bcrypt.hash(process.env.USER_PASSWORD || 'user123', 10);

    const usersToCreate: (UserData & { id: string; name: string })[] = [];
    for (let i = 1; i < userCount; i++) {
      usersToCreate.push({
        id: randomUUID(),
        name: `User ${i}`,
        email: `user${i}@example.com`,
        password: userPassword,
        firstName: 'User',
        lastName: `${i}`,
        role: 'USER' as const,
      });
    }

    if (usersToCreate.length > 0) {
      try {
        await db.insert(user).values(usersToCreate);
        console.log(`✅ Created ${usersToCreate.length} additional users`);
        for (const u of usersToCreate) console.log(`   - ${u.email}`);
      } catch (error) {
        console.error('❌ Error creating users:', error);
        throw error;
      }
    }
  }
}

async function createPosts(options: SeedOptions) {
  if (!options.includeTestData) {
    console.log('⏭  Skipping posts creation (test data disabled)');
    return;
  }

  console.log('📝 Creating sample posts...');

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
      title: 'Introduction to Drizzle',
      content: 'Drizzle is a TypeScript ORM for SQL.',
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
      await db.insert(post).values(postsToCreate.map((p) => ({ id: randomUUID(), ...p })));
      console.log(`✅ Created ${postsToCreate.length} posts`);
      for (const p of postsToCreate) console.log(`   - ${p.title}`);
    } catch (error) {
      console.error('❌ Error creating posts:', error);
      throw error;
    }
  }
}

async function cleanup() {
  if (process.env.SEED_CLEANUP === 'true') {
    console.log('🧹 Cleaning up existing data...');
    try {
      await db.delete(post);
      await db.delete(user);
      console.log('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
      throw error;
    }
  }
}

async function main() {
  const options = parseArgs();
  const startTime = Date.now();

  console.log('🌱 Starting database seeding...');
  console.log('📋 Seed options:', options);

  try {
    await cleanup();
    await createUsers(options);
    await createPosts(options);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Database seeding completed successfully in ${duration}s!`);
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'Unknown error');
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
