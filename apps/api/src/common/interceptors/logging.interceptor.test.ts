import type { LoggerService } from '@app/logger/logger.service';
import { requestStorage } from '@core/shared-kernel/request-context';
import type { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { LoggingInterceptor } from './logging.interceptor';

/**
 * interceptor 换源回归测（module-common-request-correlation · FR-5）：
 * 日志行 id 必须读统一源（ALS→缺省 Fastify req.id），弃旧 `req-${now}-${Math.random()}`
 * 自造孤岛——同 req 连续两次调用 id 恒等即锁死"不再随机"。
 */
function makeContext(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const handler = { handle: () => of({ ok: true }) };

function makeInterceptor(logger: {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}) {
  return new LoggingInterceptor(logger as unknown as LoggerService);
}

describe('LoggingInterceptor 关联 id 换源', () => {
  it('ALS 在链上时读上下文 id（与响应头/event 表同源）', () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const interceptor = makeInterceptor(logger);
    requestStorage.run({ requestId: 'rq-77' }, () => {
      interceptor
        .intercept(makeContext({ method: 'GET', url: '/x', body: {}, headers: {} }), handler)
        .subscribe();
    });
    expect(logger.log.mock.calls[0]?.[0]).toContain('Request [rq-77]');
  });

  it('链外回落 Fastify 原生 req.id，且连续两次恒等（无 Math.random 残留）', () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const interceptor = makeInterceptor(logger);
    const req = { method: 'GET', url: '/x', body: {}, headers: {}, id: 'fb-9' };
    interceptor.intercept(makeContext(req), handler).subscribe();
    interceptor.intercept(makeContext(req), handler).subscribe();
    // 同步 subscribe 下日志序列为 Req/Resp/Req/Resp，只抽 Request 行断言。
    const requestLines = logger.log.mock.calls
      .map((c) => String(c[0]))
      .filter((line) => line.startsWith('Request ['));
    expect(requestLines).toHaveLength(2);
    for (const line of requestLines) {
      expect(line).toContain('Request [fb-9]');
    }
  });
});
