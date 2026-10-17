import type { ErrorCodeValue } from '@core/saas-kit/shared-kernel/errors/error-codes';
import { ERROR_CODES, isErrorCode } from '@core/saas-kit/shared-kernel/errors/error-codes';
import type { ApiErrorBody } from './envelope';

export type { ErrorCodeValue };
/**
 * 错误码消费面（前端 F1 · module-frontend-api-client §2.2.3）——**单源不复制**：
 * 码表真相源 = `@core/saas-kit/shared-kernel/errors/error-codes`（29 码·契约测试双向锁），
 * 本模块只 re-export + 加判别原语，绝不另立第二源。
 */
export { ERROR_CODES, isErrorCode };

/** 从任意响应体窄化出 errorCode（无/非串形态 → undefined）。 */
export function errorCodeOf(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'errorCode' in body) {
    const code = (body as { errorCode?: unknown }).errorCode;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** 判别原语：错误响应体是否携带指定业务码（据 @core 单源码表分支）。 */
export function hasErrorCode(body: unknown, code: ErrorCodeValue): boolean {
  return errorCodeOf(body) === code;
}

/** 类型化错误（throw 面·保留 filter 原始 body 供上层据 errorCode 分支、据 message 展示）。 */
export class ApiError extends Error {
  readonly body: ApiErrorBody;

  constructor(body: ApiErrorBody) {
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    super(message);
    this.name = 'ApiError';
    this.body = body;
  }

  get errorCode(): string | undefined {
    return this.body.errorCode;
  }
}
