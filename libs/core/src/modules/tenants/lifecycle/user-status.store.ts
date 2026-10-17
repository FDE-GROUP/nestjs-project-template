/**
 * User status store port（global-tenancy S10 · §9.5.4①B 端口倒置）。
 *
 * `UserStatusService` 是用户生命周期状态的唯一读写卡点（S6 · FR-10），但 core 侧不应感知
 * 具体 `user`/`user_status` 表与旧实现。此端口抽象三个持久化原语，旧 ORM 适配在参考应用实现。
 */
export const USER_STATUS_STORE = Symbol('USER_STATUS_STORE');

export interface UserStatusStore {
  /** `user_status` 行状态；无行 → `undefined`（deny-list：视同 active）。 */
  readStatus(userId: string): Promise<string | undefined>;
  /** 平台用户是否存在（`user` 表命中）——不存在则 transition 报 not-found。 */
  userExists(userId: string): Promise<boolean>;
  /** upsert `user_status`（存在则更新 status/reason/updatedAt）。 */
  upsert(userId: string, status: string, reason: string | null): Promise<void>;
}
