import { defineEntity, p } from '@mikro-orm/core';

/**
 * ORM 修宪案 B · 切片 1 —— Better Auth 表面实体的 **零装饰器** 定义（MikroORM v7 `defineEntity`）。
 *
 * 形态（依 plan §5 Q2 裁决）：采零装饰器 + `defineEntity`/`p` 构造器，S9 三重约束在 ORM 实体面**不适用**
 * （实体非 DI 目标，无 `design:paramtypes` 之虞）。字段一律**扁平标量列**：跨模型外键当普通 string 列存
 * （不建 Mikro 关系对象——BA adapter 以「模型名 → entity」映射逐表寻址，不依赖 ORM 级 relation 装配）。
 * 列名走 **`EntityCaseNamingStrategy`**（见 orm.ts）：属性名**原样**作列名（camelCase 列，SQL 中一律双引号限定），
 * 使 BA 侧 DB 字段名（camelCase）与物理列名**直接对齐**——adapter 以手写 SQL（`em.execute`）寻址时键名两侧一致。
 * 表名单词小写与 BA 模型名对齐（`user`/`account`/…）。
 *
 * 字段集与 `apps/api/src/database/schema.ts`（现 Drizzle 生产表面）逐列对齐，另加 `dateField`
 * （供 `@better-auth/test-utils` authFlow 的 additional-fields 一致性用例往返 Date）。
 *
 * 本目录在切片 1 **未接入生产装配**（生产仍跑 Drizzle，见 auth.implement.ts）；切片 3 才换接链。
 */

export const User = defineEntity({
  name: 'User',
  tableName: 'user',
  properties: {
    id: p.string().primary(),
    name: p.string(),
    email: p.string(),
    emailVerified: p.boolean(),
    image: p.string().nullable(),
    // BA user additionalFields（auth.implement.ts：isOwner / handle）——本 Mikro 表面仅承载「BA core 会写入的列」，
    // authFlow 一致性用例走 harness 默认 options（不含本仓 additionalFields），故 isOwner 走 DB 默认、handle 可空，
    // 避免 core signUp 未带这两列时触发 NOT NULL。生产接链面（切片 3）以真实 additionalFields 覆盖。
    isOwner: p.boolean().default(false),
    handle: p.string().nullable(),
    // 业务字段（本地邮箱注册面）
    password: p.string().nullable(),
    firstName: p.string().nullable(),
    lastName: p.string().nullable(),
    // test-utils additional-fields 一致性用例（type:'date'）
    dateField: p.datetime().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Account = defineEntity({
  name: 'Account',
  tableName: 'account',
  properties: {
    id: p.string().primary(),
    accountId: p.string(),
    providerId: p.string(),
    userId: p.string(),
    accessToken: p.string().nullable(),
    refreshToken: p.string().nullable(),
    idToken: p.string().nullable(),
    accessTokenExpiresAt: p.datetime().nullable(),
    refreshTokenExpiresAt: p.datetime().nullable(),
    scope: p.string().nullable(),
    password: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Session = defineEntity({
  name: 'Session',
  tableName: 'session',
  properties: {
    id: p.string().primary(),
    expiresAt: p.datetime(),
    token: p.string(),
    userId: p.string(),
    // session additionalFields（provider / activeOrganizationId / ipAddress / userAgent）
    provider: p.string().nullable(),
    activeOrganizationId: p.string().nullable(),
    ipAddress: p.string().nullable(),
    userAgent: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Verification = defineEntity({
  name: 'Verification',
  tableName: 'verification',
  properties: {
    id: p.string().primary(),
    identifier: p.string(),
    value: p.string(),
    expiresAt: p.datetime(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Organization = defineEntity({
  name: 'Organization',
  tableName: 'organization',
  properties: {
    id: p.string().primary(),
    name: p.string(),
    slug: p.string(),
    logo: p.string().nullable(),
    metadata: p.json<Record<string, any>>().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
});

export const Member = defineEntity({
  name: 'Member',
  tableName: 'member',
  properties: {
    id: p.string().primary(),
    organizationId: p.string(),
    userId: p.string(),
    role: p.string(),
    createdAt: p.datetime(),
  },
});

export const Invitation = defineEntity({
  name: 'Invitation',
  tableName: 'invitation',
  properties: {
    id: p.string().primary(),
    organizationId: p.string(),
    email: p.string(),
    role: p.string(),
    status: p.string(),
    expiresAt: p.datetime(),
    inviterId: p.string(),
    createdAt: p.datetime(),
  },
});

export const MIKRO_ENTITIES = [
  User,
  Account,
  Session,
  Verification,
  Organization,
  Member,
  Invitation,
];

/** 模型名（小写）→ entity schema。BA 传下的 `model` 是物理/表名，`modelKey` 是规范模型名。 */
export const BY_MODEL: Record<string, any> = {
  user: User,
  account: Account,
  session: Session,
  verification: Verification,
  organization: Organization,
  member: Member,
  invitation: Invitation,
};
