/**
 * 限流信任链解析单源（module-auth-ip-trust 先例的**双链扩展**·module-common-rate-limit 乙裁）：
 * `AUTH_TRUSTED_PROXIES` 逗号分隔 CIDR 列表，同一 env 源喂两条链——
 * ① BA `advanced.ipAddress.trustedProxies`（认证面自有 3次/10s 限流·key=getIP|path）；
 * ② Nest 限流墙（module-common-rate-limit）经 Fastify `trustProxy` → `req.ip` →
 *    throttler 默认 tracker。未配/空 → undefined（不传，保持安全默认：直连 socket IP）。
 * 单源理由：双链若各自解析/各自配置必漂移——反代后一条链拿到真 IP、另一条落共享桶，
 * 误杀面只会出现「一护一不护」的半开态。库实锤见 ip-trust 片（共享桶=整站误杀）。
 */
export function parseTrustedProxies(value?: string): string[] | undefined {
  const list = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}
