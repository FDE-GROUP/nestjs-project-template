import { requestStorage } from '@core/shared-kernel/context/request-context';
import {
  type ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * HttpExceptionFilter 单测（错误响应契约增强片·补该 filter 此前的零单测欠账）：
 * 锁定 requestId 兜底链（ALS → request.id → 'req-unknown'）与 errorCode 透传形态。
 */

interface SentBody {
  [key: string]: unknown;
}

function createHost(request: Record<string, unknown>) {
  const sent: { body?: SentBody; status?: number } = {};
  const reply = {
    status: (code: number) => {
      sent.status = code;
      return reply;
    },
    send: (body: SentBody) => {
      sent.body = body;
      return reply;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

function createFilter() {
  const logger = { error: vi.fn(), warn: vi.fn() } as never;
  return new HttpExceptionFilter(logger);
}

describe('HttpExceptionFilter · requestId 契约', () => {
  it('ALS 上下文存在时，响应体 requestId 取 currentRequestId()', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/x', method: 'GET', id: 99 });

    requestStorage.run({ requestId: 'als-1' }, () => {
      filter.catch(new ForbiddenException('nope'), host);
    });

    expect(sent.body?.requestId).toBe('als-1');
    expect(sent.status).toBe(403);
  });

  it('无 ALS 上下文时回落 Fastify 原生 request.id', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/x', method: 'GET', id: 42 });

    filter.catch(new ForbiddenException('nope'), host);

    expect(sent.body?.requestId).toBe('42');
  });

  it('ALS 与 request.id 俱缺时落 req-unknown，且 500 形状不缺 requestId', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/x', method: 'GET' });

    filter.catch(new InternalServerErrorException('boom'), host);

    expect(sent.body?.requestId).toBe('req-unknown');
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('裸 Error（非 HttpException）兜底 500 时同样携带 requestId', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/y', method: 'POST', id: 7 });

    requestStorage.run({ requestId: 'als-err' }, () => {
      filter.catch(new Error('db exploded'), host);
    });

    expect(sent.body?.requestId).toBe('als-err');
    expect(sent.body?.message).toBe('db exploded');
    expect(sent.status).toBe(500);
  });
});

describe('HttpExceptionFilter · errorCode 透传', () => {
  it('object response 携带字符串 errorCode 时透传', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/z', method: 'GET', id: 1 });

    filter.catch(
      new ForbiddenException({ message: '租户上下文缺失', errorCode: 'NO_ACTIVE_TENANT' }),
      host,
    );

    expect(sent.body?.errorCode).toBe('NO_ACTIVE_TENANT');
    expect(sent.body?.message).toBe('租户上下文缺失');
  });

  it('未携带 errorCode 时响应体不含该键（可选字段非破坏）', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/z', method: 'GET', id: 1 });

    filter.catch(new ForbiddenException('plain string'), host);

    expect('errorCode' in (sent.body as object)).toBe(false);
  });

  it('errorCode 非字符串（脏数据）时不透传', () => {
    const filter = createFilter();
    const { host, sent } = createHost({ url: '/z', method: 'GET', id: 1 });

    filter.catch(new HttpException({ message: 'm', errorCode: 123 }, HttpStatus.BAD_REQUEST), host);

    expect('errorCode' in (sent.body as object)).toBe(false);
  });
});
