/**
 * envelope 契约类型（前端 F1 · module-frontend-api-client §2.2.4）——手写、纯类型零运行时。
 *
 * 与后端实存形状**对拍**（三向闭合）：
 *   接口字段集 ⟷(编译期 `_Exact` 锁)⟷ 下方 keys 数组 ⟷(runtime yaml 锁测)⟷ `openapi/openapi.yaml`
 *   ⟷(ci `openapi:drift` + apps/api `api-contracts.test.ts`)⟷ `TransformInterceptor`/`HttpExceptionFilter` 实跑产物。
 * 任一环漂移 → 编译红或测试红，「typed」地基不许静默漂移。
 */

/** 成功面：TransformInterceptor normal 分支恒定包裹 `{data, statusCode, message}`。 */
export interface ApiEnvelope<T> {
  data: T;
  statusCode: number;
  message: string;
}

/** offset 分页载荷（`Page<T>`·整个分页对象进 `data`，契约无 `meta` 键）。 */
export interface PageResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** cursor 分页载荷（`CursorPage<T>`）。 */
export interface CursorPageResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor?: string;
}

/** 字段级错误明细（ResponseErrorDetail 契约面）。 */
export interface ApiErrorDetail {
  path?: string;
  code?: string;
  message: string;
}

/** 错误面：HttpExceptionFilter.ErrorResponse 逐字段。 */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  requestId: string;
  errorCode?: string;
  errors?: ApiErrorDetail[];
}

/** envelope/错误面**期望键集**（对拍 openapi.yaml 的运行时依据·亦编译期锁的比对基准）。 */
export const API_ENVELOPE_KEYS = ['data', 'statusCode', 'message'] as const;
export const API_ERROR_BODY_KEYS = [
  'statusCode',
  'message',
  'error',
  'timestamp',
  'path',
  'requestId',
  'errorCode',
  'errors',
] as const;

// —— 编译期恒等锁：接口字段集必须与期望键数组**完全**相等（多了/少了/改名皆 tsc 红）。——
type _Exact<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
const _envLock: _Exact<keyof ApiEnvelope<unknown>, (typeof API_ENVELOPE_KEYS)[number]> = true;
const _errLock: _Exact<keyof ApiErrorBody, (typeof API_ERROR_BODY_KEYS)[number]> = true;
void _envLock;
void _errLock;
