import { errorCodeOf } from '@saas/api-client';

/** ISO date-time → YYYY-MM-DD（无法解析回落原串，避免渲染 NaN）。 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

/**
 * 把后端错误响应体窄化成一句可读文案（F2 · 错误窄化）。
 * 据 @core 单源 `errorCodeOf` 提码；message 兼容 string / string[]（filter 校验面）。
 */
export function describeApiError(body: unknown): string {
  const raw =
    body && typeof body === 'object' && 'message' in body
      ? (body as { message?: string | string[] }).message
      : undefined;
  const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? '请求失败');
  const code = errorCodeOf(body);
  return code ? `${message}（${code}）` : message;
}
