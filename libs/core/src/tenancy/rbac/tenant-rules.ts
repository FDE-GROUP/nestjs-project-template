/**
 * Tenant-level RBAC 规则单源（module-rbac-casl §2.1 · 授权裁决唯一权威）。
 *
 * 人裁新宪 2026-10-17：Better Auth 只管认证（身份 / 会话 / membership 数据），
 * **授权裁决归 CASL**。本表是权限矩阵的 SSOT，CASL ability 是其按角色的纯投影
 * （app 侧 `casl-ability.factory`）；「禁散点特判 / 不实现平行权限矩阵」条款语义
 * 不变，只是真源从 BA ac 声明表迁到此处（S3 D2「ac 单一权限源」旧裁作废）。
 *
 * 分层语义平移旧 tenantRoles（S3 人裁 D2：workspace 无独立角色层——read 全员 ·
 * create/update/delete 仅 owner+admin）。`Member/Invitation` 的 `read` = **现状对拍**
 * 扩项（BA 1.7.7 源码坐实：list-members / list-invitations 内置端点仅验 isMember，
 * 无 ac 检查——全成员本就可读），非新增权限。词表与 `@Can(action, subject)` 装饰器
 * 对齐：subject 用 CASL 惯用 PascalCase 资源名。
 *
 * 纯 TS 零依赖（框架/CASL 均不入本层·architecture 分层矩阵）；本表属 tenancy
 * 上下文自有的领域规则（global-contract-placement 判据②：留属主上下文）。
 */

/** 租户级角色（BA organization_member.role 的认证域事实，裁决输入而非裁决者）。 */
export type TenantRole = 'owner' | 'admin' | 'member';

/** 可授权资源（本表即资源词汇唯一源；新增资源先加这里）。 */
export type TenantSubject = 'Organization' | 'Member' | 'Invitation' | 'Workspace';

/** 动作词汇表（与 CASL can(action, subject) 第一元组参一致）。 */
export type TenantAction = 'create' | 'read' | 'update' | 'delete' | 'cancel';

/**
 * 角色 → 资源 → 允许动作。**表外即拒绝**（fail-closed 由投影侧天然成立：
 * 未声明的 (role, subject, action) 组合在 ability 中无规则 → cannot）。
 */
export const TENANT_RULES: Readonly<
  Record<TenantRole, Readonly<Record<TenantSubject, readonly TenantAction[]>>>
> = {
  owner: {
    Organization: ['update', 'delete'],
    Member: ['read', 'update', 'delete'],
    Invitation: ['read', 'create', 'cancel'],
    Workspace: ['create', 'read', 'update', 'delete'],
  },
  admin: {
    Organization: ['update'],
    Member: ['read', 'update', 'delete'],
    Invitation: ['read', 'create', 'cancel'],
    Workspace: ['create', 'read', 'update', 'delete'],
  },
  // S3 D2 分层：member 对 workspace 只读；org 面零权限（ac 旧表 member 仅 ac:['read']，
  // 该资源随 BA ac 插件退场，本表无对应）。Member/Invitation read = 现状内置端点
  // 仅验 isMember（全成员可读·BA 源码对拍），非放权。
  member: {
    Organization: [],
    Member: ['read'],
    Invitation: ['read'],
    Workspace: ['read'],
  },
};

/** 角色词汇（供守卫/校验枚举，不散落字面量）。 */
export const TENANT_ROLE_VALUES: readonly TenantRole[] = ['owner', 'admin', 'member'];
