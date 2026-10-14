/**
 * 表所有权纪律·机读单源（microservice-readiness 首切片 #1）。
 *
 * 语义（成文条款见 `docs/specs/architecture.md` 附录）：
 * - **写侧严格**：任何仓储/服务的 `insert/update/delete` 目标表必须属本上下文 owned 集；
 * - **读侧宽松**：跨上下文 select/join 允许（CQRS read-model 固有形态），不受本表约束；
 * - 新表入 owned 集须改本文件并过审计门（本文件是清单 SSOT，文档只写语义不抄清单）。
 *
 * 键为 `schema.ts` 导出名（非物理表名），值为限界上下文标识：
 * `modules/<ctx>/**` 与 `tenancy/**`（归 `tenants`）为守卫扫描的上下文推导源。
 */
export const TABLE_OWNERSHIP: Record<string, string> = {
  // auth core：Better Auth adapter 运行时写 + users 注册路径源码写
  user: 'users',
  account: 'auth',
  session: 'auth',
  verification: 'auth',
  consent: 'auth',
  // tenancy：审批制生命周期与成员域（BA organization/member/invitation 由本侧服务端 SDK 写）
  organization: 'tenants',
  member: 'tenants',
  invitation: 'tenants',
  userStatus: 'tenants',
  // 各业务上下文
  workspace: 'workspaces',
  post: 'posts',
  tenantSubscription: 'subscriptions',
  // database 基础设施：ES 端口（DrizzleEventStore）独占写面，业务仓储不得直写 event（§6-丙）
  event: 'database',
};

/**
 * 显式声明的写侧例外（可审、可数、有归因——替代逐模块特判的暗账）。
 * 新增例外必须过审计门并在 plan 留痕。
 */
export interface WriteException {
  /** 相对 `apps/api/src` 的文件路径。 */
  readonly file: string;
  /** 被跨写的表（schema 导出名）。 */
  readonly table: string;
  /** 归因说明。 */
  readonly reason: string;
}

export const WRITE_EXCEPTIONS: readonly WriteException[] = [
  {
    // FR-10：暂停用户即时失权——suspend 治理动作硬删该用户全部 session 行。
    // session 属 auth core，但失权链是租户治理职责（global-tenancy §9.4/D4），
    // 属结构性接缝而非腐化，故声明例外而非重构（重构挪出 auth 端口超出就绪切片非目标）。
    file: 'modules/tenants/application/commands/handlers/suspend-user.command-handler.ts',
    table: 'session',
    reason: 'FR-10 deny-list 即时失权（治理失权链硬删 session·归因 global-tenancy）',
  },
];
