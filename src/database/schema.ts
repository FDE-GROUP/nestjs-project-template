import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
  // Better Auth organization plugin: currently active tenant (D4 session-cookie).
  // Set by `/organization/set-active`; read back by `getSession` as the tenant source.
  activeOrganizationId: text('activeOrganizationId'),
  // Better Auth core session fields (BA 1.7.7 runtime schema validation expects these;
  // stored on session creation for audit / revoke). Optional → nullable.
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
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

// PIPL consent ledger (C1 · FR-7 / D7).
// Records "purpose × version" granularity per §11-3.
// `userId` uses ON DELETE SET NULL so that a hard user deletion (PIPL right to erase)
// leaves the consent row anonymous yet retained for compliance audit trail.
export const consent = pgTable(
  'consent',
  {
    id: text('id').primaryKey(),
    userId: text('userId').references(() => user.id, { onDelete: 'set null' }),
    purpose: text('purpose').notNull(),
    version: text('version').notNull(),
    grantedAt: timestamp('grantedAt', { mode: 'date' }).notNull().defaultNow(),
    revokedAt: timestamp('revokedAt', { mode: 'date' }),
    evidence: text('evidence'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [index('consent_user_purpose_idx').on(table.userId, table.purpose)],
);

// Sample business model.
// S2 · 数据隔离强制 (FR-5/NFR-2): tenant-owned business rows carry `organizationId`
// (== tenant id, Tenant = organization) with a composite index for tenant-scoped reads.
// S3 · workspace 二级边界 (D2/§8-6): rows may further belong to a `workspaceId`; reads
// default to the compound `(organizationId, workspaceId)` scope. Both id columns are
// NULLABLE to keep migrations purely additive; NOT-NULL tightening is a later signed call.
export const post = pgTable(
  'post',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    published: boolean('published').notNull().default(false),
    organizationId: text('organizationId').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    workspaceId: text('workspaceId').references(() => workspace.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('post_organization_created_idx').on(table.organizationId, table.createdAt),
    index('post_organization_workspace_idx').on(table.organizationId, table.workspaceId),
  ],
);

// ===== Better Auth organization plugin (multi-tenancy · 混合复用 S0) =====
// Table / column names MUST match Better Auth's expected field names; the drizzle
// adapter maps them by the `schema` object KEYS below (organization / member / invitation).
// Tenant == organization (no separate tenant table, see global-tenancy §9.2).
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  logo: text('logo'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }),
  metadata: jsonb('metadata'),
});

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('member_org_user_idx').on(table.organizationId, table.userId)],
);

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
    inviterId: text('inviterId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('invitation_org_email_idx').on(table.organizationId, table.email)],
);

// ===== S3 · workspace 二级边界 (D2/§8-6) =====
// A workspace is a sub-tenant grouping WITHIN one organization (tenant).
// No separate role layer (D2): visibility is decided by tenant-level perms; the
// active workspace is a per-request selector (header `x-workspace-id`). Business
// rows carry `(organizationId, workspaceId)` and reads default to that compound scope.
// `organizationId` is NOT NULL + cascade (a workspace always belongs to a live tenant);
// `slug` is unique per-organization.
export const workspace = pgTable(
  'workspace',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex('workspace_org_slug_idx').on(table.organizationId, table.slug)],
);

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
  consents: many(consent),
}));

export const consentRelations = relations(consent, ({ one }) => ({
  user: one(user, {
    fields: [consent.userId],
    references: [user.id],
  }),
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
  consent,
  post,
  organization,
  member,
  invitation,
  workspace,
};

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Consent = typeof consent.$inferSelect;
export type NewConsent = typeof consent.$inferInsert;
export type Post = typeof post.$inferSelect;
export type NewPost = typeof post.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type NewOrganization = typeof organization.$inferInsert;
export type Member = typeof member.$inferSelect;
export type NewMember = typeof member.$inferInsert;
export type Invitation = typeof invitation.$inferSelect;
export type NewInvitation = typeof invitation.$inferInsert;
export type Workspace = typeof workspace.$inferSelect;
export type NewWorkspace = typeof workspace.$inferInsert;

// Re-export a `Role` union to replace `import { Role } from '@prisma/client'`
export const Role = {
  USER: 'USER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
