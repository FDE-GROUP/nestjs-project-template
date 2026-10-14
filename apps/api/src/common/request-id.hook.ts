import { requestStorage } from '@core/saas-kit/shared-kernel/context/request-context';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * 请求关联 id 统一链入口（module-common-request-correlation · 甲裁）：
 * Fastify `onRequest` hook 一处完成三事——定 id（入站 x-request-id 透传优先，
 * 缺省取 Fastify 原生 `req.id`）、回写响应头、`requestStorage.run` 包住
 * 后续全链（hook 先于一切 Nest middleware/guard/interceptor，天然覆盖
 * /health 等旁路路由）。独立成文件而非内联 main.ts：可单测直调。
 */
export function requestIdHook(req: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const inbound = req.headers['x-request-id'];
  const requestId = (typeof inbound === 'string' && inbound) || String(req.id);
  reply.header('x-request-id', requestId);
  requestStorage.run({ requestId }, done);
}
