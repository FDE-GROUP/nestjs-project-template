import { HttpException, type HttpStatus } from '@nestjs/common';

/**
 * BA 服务端 API 错误 → HTTP 语义映射（门面统一出口·module-rbac-casl §2.3.1）。
 *
 * 已是 Nest `HttpException`（门面自身的前置拒绝，如 auth 实例未就绪/guard 拒）原样直透，
 * 不二次包装（保类型与 errorCode 不降级）。
 * BA `APIError` 携带 `status`（4xx=权限/数据事实拒绝，如 membership 校验、seats 402、
 * 业务 400）——4xx 透传状态与消息；5xx/未知错误原样上抛交全局异常过滤器（500 面不伪装）。
 */
export function mapBaError(err: unknown): never {
  if (err instanceof HttpException) throw err;
  const e = err as { status?: unknown; message?: unknown } | undefined;
  const raw = e?.status;
  const status = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    throw new HttpException(String(e?.message ?? 'Bad Request'), status as HttpStatus);
  }
  throw err;
}
