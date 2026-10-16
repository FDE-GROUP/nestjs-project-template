import type { EntitySchema } from '@mikro-orm/core';
import { buildRuntimeEntity, type TableMeta } from './column-meta';

/**
 * ORM 修宪案 B · 切片 3c-ii —— 四表**列元数据单一源** + **运行时扁平实体**（γ）。
 *
 * 本文件是四表（`workspace`/`user_status`/`tenant_subscription`/`event`）列定义的**唯一真相源**：
 *  - `*_META` 被 `migration-entities.ts` 经 `buildMigrationEntity` 消费（迁移忠实·FK 关系·受恒等闸守护）；
 *  - 本文件另经 `buildRuntimeEntity` 派生**运行时扁平实体**并入 `MIKRO_APP_ENTITIES`（app 仓储读写）。
 * 两变体同源·消双描述（γ 立意）。companion `interface` 提供运行时实例的 TS 形状（Mikro v7 动态工厂
 * 的实例类型由同名 interface 兜·与 `post.entity.ts` 惯例一致）。
 */

export const WORKSPACE_META: TableMeta = {
  name: 'Workspace',
  tableName: 'workspace',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['organizationId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
    ['name', { k: 'text' }],
    ['slug', { k: 'text' }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime' }],
  ],
  uniques: [{ name: 'workspace_org_slug_idx', properties: ['organizationId', 'slug'] }],
};

export const USER_STATUS_META: TableMeta = {
  name: 'UserStatus',
  tableName: 'user_status',
  columns: [
    // PK-FK：userId 即主键 + FK→user（旧 ORM 仅 `on delete cascade`·显式压回 updateRule no action 求逐字对齐）。
    [
      'userId',
      { k: 'fk', target: 'User', onDelete: 'cascade', onUpdate: 'no action', primary: true },
    ],
    ['status', { k: 'text' }],
    ['reason', { k: 'text', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime' }],
  ],
};

export const TENANT_SUBSCRIPTION_META: TableMeta = {
  name: 'TenantSubscription',
  tableName: 'tenant_subscription',
  columns: [
    ['id', { k: 'text', primary: true }],
    ['tenantId', { k: 'fk', target: 'Organization', onDelete: 'cascade' }],
    ['plan', { k: 'text' }],
    ['status', { k: 'text', default: 'active' }],
    ['seatsLimit', { k: 'integer' }],
    ['storageQuota', { k: 'integer', nullable: true }],
    ['apiQuota', { k: 'integer', nullable: true }],
    ['periodStart', { k: 'datetime', defaultNow: true }],
    ['periodEnd', { k: 'datetime', nullable: true }],
    ['provider', { k: 'text', nullable: true }],
    ['providerCustomerId', { k: 'text', nullable: true }],
    ['providerSubscriptionId', { k: 'text', nullable: true }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    ['updatedAt', { k: 'datetime' }],
  ],
  indexes: [
    { name: 'tenant_subscription_tenant_status_idx', properties: ['tenantId', 'status'] },
    { name: 'tenant_subscription_tenant_period_idx', properties: ['tenantId', 'periodStart'] },
  ],
};

export const EVENT_META: TableMeta = {
  name: 'Event',
  tableName: 'event',
  columns: [
    ['id', { k: 'bigintAutoPk' }],
    ['eventId', { k: 'text' }],
    ['aggregateId', { k: 'text' }],
    ['aggregateType', { k: 'text' }],
    ['version', { k: 'integer' }],
    ['eventType', { k: 'text' }],
    ['eventVersion', { k: 'integer', default: 1 }],
    ['payload', { k: 'json' }],
    ['metadata', { k: 'json', nullable: true }],
    ['occurredAt', { k: 'datetime' }],
    ['createdAt', { k: 'datetime', defaultNow: true }],
    // ES Phase B 后半（module-es-outbox-transactional 切片 A）：outbox 投递状态列——
    // dispatchedAt 为空即未投递（at-least-once：relay 投递成功后置位）；attemptCount/lastError
    // 承载重试上限与行级拒收留痕（DLQ 以表内状态表达，不建独立死信表）。时间列同基线无 tz 口径。
    ['dispatchedAt', { k: 'datetime', nullable: true }],
    ['attemptCount', { k: 'integer', default: 0 }],
    ['lastError', { k: 'text', nullable: true }],
  ],
  uniques: [
    {
      name: 'event_aggregate_version_key',
      properties: ['aggregateType', 'aggregateId', 'version'],
    },
    { name: 'event_event_id_key', properties: ['eventId'] },
  ],
  indexes: [
    { name: 'event_aggregate_idx', properties: ['aggregateType', 'aggregateId'] },
    // relay 拉取面（WHERE dispatched_at IS NULL ORDER BY id）：普通索引即可支撑——
    // `TableMeta.indexes` 能力面不支持部分索引（partial where），为模板小表不扩列元数据机制（偏差不掩痕已登 plan §4.1）。
    { name: 'event_dispatched_idx', properties: ['dispatchedAt'] },
  ],
};

/** 四表元数据（迁移装配消费·与 `MIKRO_MIGRATION_ENTITIES` 顺序无关，恒等闸逐语句比对）。 */
export const FOUR_TABLE_METAS: TableMeta[] = [
  WORKSPACE_META,
  USER_STATUS_META,
  TENANT_SUBSCRIPTION_META,
  EVENT_META,
];

// —— 运行时扁平实体（companion interface + 工厂派生·入 MIKRO_APP_ENTITIES·app 仓储读写）——

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}
export const Workspace: EntitySchema<Workspace> = buildRuntimeEntity(
  WORKSPACE_META,
) as EntitySchema<Workspace>;

export interface UserStatus {
  userId: string;
  status: string;
  reason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const UserStatus: EntitySchema<UserStatus> = buildRuntimeEntity(
  USER_STATUS_META,
) as EntitySchema<UserStatus>;

export interface TenantSubscription {
  id: string;
  tenantId: string;
  plan: string;
  status: string;
  seatsLimit: number;
  storageQuota?: number | null;
  apiQuota?: number | null;
  periodStart: Date;
  periodEnd?: Date | null;
  provider?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export const TenantSubscription: EntitySchema<TenantSubscription> = buildRuntimeEntity(
  TENANT_SUBSCRIPTION_META,
) as EntitySchema<TenantSubscription>;

export interface Event {
  id: number;
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  eventType: string;
  eventVersion: number;
  payload: Record<string, any>;
  metadata?: Record<string, any> | null;
  occurredAt: Date;
  createdAt: Date;
  dispatchedAt?: Date | null;
  attemptCount: number;
  lastError?: string | null;
}
export const Event: EntitySchema<Event> = buildRuntimeEntity(EVENT_META) as EntitySchema<Event>;

/** 四表运行时实体集（并入 `MIKRO_APP_ENTITIES`）。 */
export const MIKRO_FOUR_TABLE_ENTITIES = [Workspace, UserStatus, TenantSubscription, Event];
