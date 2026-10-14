import { Inject, Injectable } from '@nestjs/common';
import {
  DOMAIN_EVENT_PUBLISHER,
  type DomainEventPublisher,
} from '../../shared-kernel/domain/event-publisher.port';
import { currentRequestId } from '../../shared-kernel/request-context';
import { UserStatusTransitionedEvent } from './events/user-status-transitioned.event';
import { canTransition, TENANT_STATUS, type TenantStatus } from './tenant-lifecycle';
import { USER_STATUS_STORE, type UserStatusStore } from './user-status.store';

/**
 * 用户生命周期状态复用租户状态机的 active/suspended/deleted 子集
 * （pending 属租户准入语义，用户侧不产生）。
 */
export type UserStatus = TenantStatus;

export const USER_STATUS = {
  ACTIVE: TENANT_STATUS.ACTIVE,
  SUSPENDED: TENANT_STATUS.SUSPENDED,
  DELETED: TENANT_STATUS.DELETED,
} as const;

/** 严格迁移结果结合：ok 携 previous 供审计；not-found/illegal 由调用方转 404/409。 */
export type UserTransitionResult =
  | { kind: 'ok'; previous: UserStatus | undefined; status: UserStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: UserStatus | undefined; to: UserStatus };

/**
 * 用户状态读写唯一卡点（S6 · FR-10）：落独立表 `user_status`（不动 Better Auth 的
 * `user` 表·FK 级联删除）。deny-list 语义——无记录行视同 active（fail-open 仅限
 * “未被动过暂停”的常见态，与租户状态机同口径），仅显式 suspended/deleted 才失能。
 */
@Injectable()
export class UserStatusService {
  constructor(
    @Inject(USER_STATUS_STORE) private readonly store: UserStatusStore,
    // S9 教训：非 controller provider 必须显式 @Inject token + 值导入，防 swc design:paramtypes 退化
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
  ) {}

  /** 读取用户当前生命周期状态；无记录行 → undefined（视同 active）。 */
  async read(userId: string): Promise<UserStatus | undefined> {
    return (await this.store.readStatus(userId)) as UserStatus | undefined;
  }

  /** 是否被拦（deny-list）：仅显式 suspended/deleted 为真；无行 → 不拦。 */
  async isBlocked(userId: string): Promise<boolean> {
    const status = await this.read(userId);
    return status === USER_STATUS.SUSPENDED || status === USER_STATUS.DELETED;
  }

  /**
   * 严格状态迁移：目标用户不存在 → not-found（转 404）；非法边 → illegal（转 409）；
   * 合法则 upsert `user_status` 并返回 previous 供审计。平台级动作专用（suspend/resume/delete），
   * 权限裁决归 PlatformOperatorGuard；session 硬删由调用方（治理 handler）叠加。
   * ES 第三切片：upsert 成功后经 `DOMAIN_EVENT_PUBLISHER` 产出 `user.status.transitioned`
   *（shadow append·与 user.registered 同聚合流·not-found/illegal 零发·失败连带 500 宁缺勿错发）。
   */
  async transition(
    userId: string,
    to: UserStatus,
    opts?: { reason?: string; actorId?: string },
  ): Promise<UserTransitionResult> {
    if (!(await this.store.userExists(userId))) return { kind: 'not-found' };

    const previous = await this.read(userId);
    if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to };

    await this.store.upsert(userId, to, opts?.reason ?? null);
    await this.events.publishAll([
      new UserStatusTransitionedEvent({
        aggregateId: userId,
        // 关联 id 统一链（FR-4）：治理动作均在 HTTP 请求内，后台调用允许 undefined。
        correlationId: currentRequestId(),
        payload: {
          from: previous ?? null,
          to,
          actorId: opts?.actorId,
          reason: opts?.reason,
        },
      }),
    ]);
    return { kind: 'ok', previous, status: to };
  }
}
