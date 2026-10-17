import type { LoggerOptions } from 'pino';
import { parseTrustedProxies } from './trusted-proxies';

/**
 * Fastify 装载选项单源（module-common-rate-limit 乙裁）：`AUTH_TRUSTED_PROXIES`
 * 经 `parseTrustedProxies` 透传 `trustProxy`（Fastify 5 实机对拍：`@fastify/proxy-addr`
 * compile 接受 CIDR 字符串数组·`request.js` getTrustProxyFn L43-62 坐实）——`req.ip`
 * 解析为代理链最右可信真客户端，throttler 默认 tracker（`normalizeIp(req.ip)`）据此分桶。
 * 未配 = 不传该键：保持 Fastify 默认（只信 socket 远端），直连部署语义正确。
 *
 * 返回类型采结构字面量而非具名 `FastifyServerOptions`：pnpm 仓内存在两份 fastify
 * 类型副本（5.12.5/5.12.7），具名类型跨副本不变异兼容（disableRequestLogging 函数型
 * 参数不协）；窄结构形对 FastifyAdapter 构造参恒可赋。
 *
 * `logger` 与 LoggerService 同策略（cn-adaptation §6.5）：dev/test 走 pino-pretty 彩色可读（便于开发查看），
 * prod 保持结构化 JSON（stdout·机器可检索）；级别取 `LOG_LEVEL`。
 */
export function buildFastifyHttpOptions(value?: string): {
  logger: LoggerOptions;
  trustProxy?: string[];
} {
  const trustedProxies = parseTrustedProxies(value);
  const level = process.env.LOG_LEVEL || 'info';
  const isProd = process.env.NODE_ENV === 'production';
  const logger: LoggerOptions = isProd
    ? { level }
    : {
        level,
        transport: {
          targets: [
            {
              target: 'pino-pretty',
              level,
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
            },
          ],
        },
      };
  return {
    logger,
    ...(trustedProxies ? { trustProxy: trustedProxies } : {}),
  };
}
