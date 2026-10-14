import { currentRequestId } from '@core/shared-kernel/request-context';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestIdHook } from './request-id.hook';

/**
 * hook × 真 Fastify 生命周期集成测（module-common-request-correlation）：
 * 补单测盲区——mock done 是同步直调，证不了 `requestStorage.run(…, done)` 对
 * **真 Fastify 异步链路**（onRequest → 路由 handler）的 ALS 穿透成立性。
 * 零 Nest/零 DB，可进默认 CI；main.ts 装配正确性另有实机 curl 佐证。
 */
describe('requestIdHook on real Fastify instance', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.addHook('onRequest', requestIdHook);
    app.get('/probe', async () => ({ seenInHandler: currentRequestId() }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('ALS 穿透真异步链：handler 读到的 id 与响应头回写值一致', async () => {
    const res = await app.inject('/probe');
    const headerId = res.headers['x-request-id'];
    expect(typeof headerId).toBe('string');
    expect((res.json() as { seenInHandler: string }).seenInHandler).toBe(headerId);
    expect(headerId).toBeTruthy();
  });

  it('入站 x-request-id 端到端透传：响应头与 handler 同见入站值', async () => {
    const res = await app.inject({ url: '/probe', headers: { 'x-request-id': 'trace-e2e-7' } });
    expect(res.headers['x-request-id']).toBe('trace-e2e-7');
    expect((res.json() as { seenInHandler: string }).seenInHandler).toBe('trace-e2e-7');
  });
});
