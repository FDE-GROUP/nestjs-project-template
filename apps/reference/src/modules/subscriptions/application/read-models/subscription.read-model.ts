/**
 * Subscription read-model projections (global-tenancy S7 · FR-7/FR-8 · CQRS read side).
 *
 * 当前生效档位 + 座位用量 + FR-8 映射的视图统一由 tenancy 层 `QuotaService.snapshot` 装配
 * （限额逻辑单点·禁散点），此处只做类型转发供 application/controller 消费；历史列表复用
 * domain port 的记录形状。
 */
export type { SeatQuotaSnapshot as TenantSubscriptionView } from '@core/tenancy/quota/quota.service';
export type { SubscriptionRecord as SubscriptionHistoryRow } from '../../domain/repositories/subscription.repository';
