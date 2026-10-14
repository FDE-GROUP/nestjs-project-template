/**
 * 分页契约（module-common-pagination-contract · softkit 借鉴 #2「借思路不借库」）：
 * 平台侧两个同构分页面（PlatformTenantPage/PlatformUserPage）的重复形状收敛为
 * 单一泛型契约。纯 TS 零依赖（与 AggregateRoot/DomainEvent 同居 shared-kernel，
 * core 外部依赖不变：仅 node/peer）。offset 语义——模板面向中小数据量，
 * cursor 与 sort 参数化按 plan §6-丁 缓行（有真实需求再设计）。
 */

/** 分页请求（校验/默认值在应用侧 ListPageDto 基类，port 层只收已裁决的数）。 */
export interface PageRequest {
  readonly limit: number;
  readonly offset: number;
}

/** 分页结果：items + 全量计数 + 回显请求（前端免二次拼装）。 */
export interface Page<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * 唯一构造点（丙裁）：形状纪律所在；items 浅复制，防 adapter 内部数组引用泄漏。
 */
export function createPage<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return { items: [...items], total, limit: request.limit, offset: request.offset };
}
