import { relations } from 'drizzle-orm';
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Role enum (replaces Prisma `enum Role`)
export const roleEnum = pgEnum('role', ['USER', 'ADMIN']);

/**
 * Shared user table.
 * Used by both Better Auth (core user model) and the business UsersService.
 * Column property names follow Better Auth's expected field names.
 */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('emailVerified').notNull().default(false),
    image: text('image'),

    // Better Auth additionalFields
    isOwner: boolean('isOwner').notNull().default(false),
    handle: text('handle').notNull().default(''),

    // Business fields (local email registration)
    password: text('password'),
    firstName: text('firstName'),
    lastName: text('lastName'),
    role: roleEnum('role').notNull().default('USER'),

    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('user_email_idx').on(table.email)],
);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { mode: 'date' }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { mode: 'date' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
  token: text('token').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Better Auth session additional field (OAuth provider tracking)
  provider: text('provider'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
});

// Sample business model
export const post = pgTable('post', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' })
    .notNull()
    .$onUpdate(() => new Date()),
});

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const schema = {
  user,
  account,
  session,
  verification,
  post,
};

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;

// Re-export a `Role` union to replace `import { Role } from '@prisma/client'`
export const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
