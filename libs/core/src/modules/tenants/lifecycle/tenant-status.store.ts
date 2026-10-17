/**
 * Tenant status store port（global-tenancy S10 · §9.5.4①B 端口倒置）。
 *
 * `TenantStatusService` 是租户生命周期状态的**唯一读写卡点**，但它本身**不应感知**具体
 * ORM/schema（Better Auth 的 `organization` 表、旧 ORM 连接）。此端口把「按租户 id 取回/
 * 落回 metadata」这一持久化原语抽象出来，交由参考应用的 旧 ORM 适配实现；core 侧只保留
 * 纯状态判定逻辑（`tenant-lifecycle`）。
 *
 * 约定：`load` 对**行不存在**返回 `undefined`（fail-closed：非 active / not-found 由调用方裁决）；
 * 行存在则返回其原始 `metadata`（可能是 `null`，与「无行」区分开）。`metadata` 以 `unknown`
 * 透传，端口不耦合列类型。
 */
export const TENANT_STATUS_STORE = Symbol('TENANT_STATUS_STORE');

export interface TenantStatusStore {
  /** 组织行不存在 → `undefined`；存在 → 携其原始 metadata（可为 null）。 */
  load(organizationId: string): Promise<{ metadata: unknown } | undefined>;
  /** 合并写回 metadata（保留其余键由调用方经 `withTenantStatus` 完成）。 */
  save(organizationId: string, metadata: Record<string, unknown>): Promise<void>;
}
