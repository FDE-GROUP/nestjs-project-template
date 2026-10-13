import { Inject, Injectable } from '@nestjs/common';
import {
  canTransition,
  isTenantBlocked,
  readTenantStatus,
  type TenantStatus,
  withTenantStatus,
} from './tenant-lifecycle';
import { TENANT_STATUS_STORE, type TenantStatusStore } from './tenant-status.store';

/** 严格迁移结果结合（S5）：ok 携 previous 供审计；not-found/illegal 由调用方转 404/409。 */
export type TenantTransitionResult =
  | { kind: 'ok'; previous: TenantStatus | undefined; status: TenantStatus }
  | { kind: 'not-found' }
  | { kind: 'illegal'; from: TenantStatus | undefined; to: TenantStatus };

/**
 * 租户状态读写唯一卡点（S4 · FR-1）：直接落 `organization.metadata`（jsonb），
 * 不另建表/列 → 无迁移。读侧 fail-closed：查无此行/非法 status 一律非 active。
 */
@Injectable()
export class TenantStatusService {
  constructor(@Inject(TENANT_STATUS_STORE) private readonly store: TenantStatusStore) {}

  /** 读取租户当前生命周期状态；行不存在/无合法状态 → undefined。 */
  async read(organizationId: string): Promise<TenantStatus | undefined> {
    const row = await this.store.load(organizationId);
    return readTenantStatus(row?.metadata);
  }

  /** 是否生效（FR-1/NFR-1 fail-closed：仅显式 active 为真）。 */
  async isActive(organizationId: string): Promise<boolean> {
    return (await this.read(organizationId)) === 'active';
  }

  /**
   * 是否被拦（S4 中间件失能卡点·deny-list）：查无此行视同不拦（fail-open
   * 仅限“无租户行”边界，与 fail-closed 隔离不矛盾——无行则下游租户解析早已 fail）。
   */
  async isBlocked(organizationId: string): Promise<boolean> {
    const row = await this.store.load(organizationId);
    return isTenantBlocked(row?.metadata);
  }

  /**
   * 严格状态迁移（S5 收紧）：按 §9.4 迁移表裁决合法边，非法 → illegal（调用方转 409）；
   * 行不存在 → not-found（转 404）；合法则合并写回 metadata（保留其余键）并返回 previous
   * 供审计。平台级动作专用（approve/suspend/resume/delete），权限裁决归 PlatformOperatorGuard。
   */
  async transition(organizationId: string, to: TenantStatus): Promise<TenantTransitionResult> {
    const row = await this.store.load(organizationId);
    if (!row) return { kind: 'not-found' };
    const previous = readTenantStatus(row.metadata);
    if (!canTransition(previous, to)) return { kind: 'illegal', from: previous, to };
    const metadata = withTenantStatus(row.metadata, to);
    await this.store.save(organizationId, metadata);
    return { kind: 'ok', previous, status: to };
  }
}
