import { currentRequestId } from '@core/shared-kernel/request-context';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { requestIdHook } from './request-id.hook';

/**
 * 关联 id hook 行为单测（module-common-request-correlation · 甲裁）：
 * 最小结构 mock 直调 hook——透传优先/缺省 req.id/空串不透传/回写响应头/ALS 包裹 done。
 */
function makeReq(headers: Record<string, string>, id: string | number = 'fastify-1') {
  return { headers, id } as unknown as FastifyRequest;
}

function makeReply() {
  return { header: vi.fn() } as unknown as FastifyReply;
}

describe('requestIdHook（Fastify onRequest）', () => {
  it('入站 x-request-id 透传优先：响应头与 ALS 同为入站值', () => {
    const reply = makeReply();
    let seenInside: string | undefined;
    requestIdHook(makeReq({ 'x-request-id': 'inbound-9' }), reply, () => {
      seenInside = currentRequestId();
    });
    expect(reply.header).toHaveBeenCalledWith('x-request-id', 'inbound-9');
    expect(seenInside).toBe('inbound-9');
  });

  it('无入站头则缺省取 Fastify 原生 req.id', () => {
    const reply = makeReply();
    let seenInside: string | undefined;
    requestIdHook(makeReq({}, 42), reply, () => {
      seenInside = currentRequestId();
    });
    expect(reply.header).toHaveBeenCalledWith('x-request-id', '42');
    expect(seenInside).toBe('42');
  });

  it('空串入站头不算透传（防上游空值污染），回落 req.id', () => {
    const reply = makeReply();
    requestIdHook(makeReq({ 'x-request-id': '' }, 'fb-7'), reply, () => {});
    expect(reply.header).toHaveBeenCalledWith('x-request-id', 'fb-7');
  });

  it('done 恰好调用一次且 ALS 出链复位', () => {
    const done = vi.fn(() => {
      expect(currentRequestId()).toBe('r-x');
    });
    requestIdHook(makeReq({ 'x-request-id': 'r-x' }), makeReply(), done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(currentRequestId()).toBeUndefined();
  });
});
