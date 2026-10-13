import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { type ActiveSubscriptionView, QUOTA_STORE, type QuotaStore } from './quota.store';
import { FREE_PLAN } from './tenant-plans';

/** 一次座位配额裁决的结果（used/limit 供审计与回显）。 */
export interface SeatQuotaVerdict {
  readonly ok: boolean;
  readonly used: number;
  readonly limit: number;
}

/** 读侧快照（GET current 的唯一装配点·FR-7/FR-8 视图）：生效档位 + 用量 + 映射。 */
export interface SeatQuotaSnapshot {
  readonly hasSubscription: boolean;
  readonly plan: string;
  readonly seatsLimit: number;
  readonly used: number;
  readonly remaining: number;
  readonly providerCustomerId: string | null;
}

/**
 * 租户配额读写唯一卡点（S7 · FR-7）：生效限额取自最新 active 订阅行的 `seatsLimit`
 * 快照，缺行回落 `FREE_PLAN`（带限额·裁②非 fail-open）。用量维度 = 成员数
 * （`COUNT(member where organizationId)`·实时算·不建 usage 表）。超限以 402 拒绝。
 * 与 `UserStatusService`/`TenantStatusService` 同层，禁散点，由 `QuotaGuard` 单点调用。
 */
@Injectable()
export class QuotaService {
  constructor(@Inject(QUOTA_STORE) private readonly store: QuotaStore) {}

  /** 当前生效订阅（最新 active 行 by periodStart desc），无 → null。 */
  async currentSubscription(tenantId: string): Promise<ActiveSubscriptionView | null> {
    return this.store.currentActiveSubscription(tenantId);
  }

  /** 生效座位限额：有 active 订阅 → 其 seatsLimit；无 → FREE_PLAN 限额。 */
  async effectiveSeatsLimit(tenantId: string): Promise<number> {
    const sub = await this.currentSubscription(tenantId);
    return sub?.seatsLimit ?? FREE_PLAN.seatsLimit;
  }

  /** 当前用量 = 该租户成员数。 */
  async currentSeats(tenantId: string): Promise<number> {
    return this.store.countMembers(tenantId);
  }

  /** 纯裁决（不抛）：used + adding 是否仍在限额内。 */
  async checkSeats(tenantId: string, adding = 1): Promise<SeatQuotaVerdict> {
    const [limit, used] = await Promise.all([
      this.effectiveSeatsLimit(tenantId),
      this.currentSeats(tenantId),
    ]);
    return { ok: used + adding <= limit, used, limit };
  }

  /** fail-closed 断言：超限抛 402（Payment Required·语义=需升级档位）。 */
  async assertSeats(tenantId: string, adding = 1): Promise<void> {
    const verdict = await this.checkSeats(tenantId, adding);
    if (!verdict.ok) {
      throw new HttpException(
        `Seat quota exceeded: ${verdict.used}+${adding} > ${verdict.limit}`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /**
   * 读侧单点快照（S7 · FR-7/FR-8）：当前生效订阅（缺行回落免费档）+ 座位用量 +
   * FR-8 customer 映射。复用 `currentSubscription`/`currentSeats`·限额逻辑不另起炉灶（禁散点）。
   */
  async snapshot(tenantId: string): Promise<SeatQuotaSnapshot> {
    const sub = await this.currentSubscription(tenantId);
    const limit = sub?.seatsLimit ?? FREE_PLAN.seatsLimit;
    const used = await this.currentSeats(tenantId);
    return {
      hasSubscription: sub !== null,
      plan: sub?.plan ?? FREE_PLAN.plan,
      seatsLimit: limit,
      used,
      remaining: Math.max(0, limit - used),
      providerCustomerId: sub?.providerCustomerId ?? null,
    };
  }
}
