// S9 铁律：构造函数注入的类必须值导入 + 显式 @Inject（仅类型位会被 Biome autofix 成 import type →
// design:paramtypes 退化、DI 运行时 UnknownDependenciesException——原 AuthMiddleware 同款写法）
import { ConfigService } from '@app/config/config.service';
import { DrizzleService } from '@app/database/drizzle.service';
import { QuotaService } from '@core/saas-kit/tenancy/quota/quota.service';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { BetterAuthOptions } from 'better-auth';
import { AuthInstanceInjectKey, OAuthProviderType } from './auth.constant';
import { CreateAuth } from './auth.implement';
import type { InjectAuthInstance } from './auth.interface';
import { buildGenericOAuthConfigs } from './generic-oauth-channels';

/** 接线所需的最小 Fastify 实例面（避免全类型依赖 fastify 导入面）。 */
interface FastifyLike {
  all: (path: string, handler: (req: unknown, reply: FastifyLikeReply) => Promise<void>) => unknown;
}
interface FastifyLikeReply {
  raw: { writableEnded: boolean };
  code: (status: number) => unknown;
  send: (body: unknown) => unknown;
}

/**
 * BA HTTP 面接线（module-auth-http-surface·人裁甲1+乙1+丙+丁+戊）：
 * 原 AuthMiddleware 的 handler 装配职责保留，转发职责改为 **Fastify 实例级通配路由**——
 * 旧中间件 forRoutes 通配只绑定已注册 Nest 路由（`/api/v1/auth/**` 下无路由），router 先 404、
 * handler 永不得跑，BA 原生 HTTP API 面整面不可达（实机四探存照）。实例级 `all()` 绕开
 * Nest router/guard/validation 三层，与 BA "原生 handler 吃 req/res" 形态最贴合；
 * basePath 维持 CreateAuth 现值 `/api/v1/auth`（乙1）。
 */
@Injectable()
export class AuthBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthBootstrapService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(DrizzleService) private readonly drizzleService: DrizzleService,
    @Inject(QuotaService) private readonly quotaService: QuotaService,
    @Inject(AuthInstanceInjectKey) private readonly authInstance: InjectAuthInstance,
    @Inject(HttpAdapterHost) private readonly httpAdapterHost: HttpAdapterHost,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { handler, auth } = CreateAuth(
      this.buildSocialProviders(),
      this.buildGenericConfigs(),
      this.drizzleService,
      this.configService,
      this.quotaService,
    );
    this.authInstance.set(auth);

    const basePath = (auth.options as { basePath?: string }).basePath ?? '/api/v1/auth';
    // spike 实锤（fastify 5.12.5/find-my-way 9.10.0）：仅支持裸尾 `*` 通配，`{*name}` 语法报
    // "Wildcard must be the last character"——挂 basePath 下全部 BA 原生端点。
    const pattern = `${basePath}/*`;
    const app = this.httpAdapterHost.httpAdapter.getInstance<FastifyLike>();
    app.all(pattern, async (req, reply) => {
      try {
        // Fastify 已消费 raw 流完成 body 解析；better-call 的 node 适配器（BA 底座）对
        // "已解析体"有原生兼容分支（req.body !== undefined → 序列化回放，见
        // better-call@1.4.0 dist/adapters/node/request.mjs getRequest），故把解析结果挂回
        // raw 即可——不挂则 BA 读到空流报 "[body] expected object, received undefined"（实机坐实）。
        const raw = req as { raw?: { body?: unknown }; body?: unknown };
        if (raw.raw && raw.raw.body === undefined && raw.body !== undefined) {
          raw.raw.body = raw.body;
        }
        await handler(req as never, reply as never);
      } catch (error) {
        // handler 内部已有 res.code(500) 兜底；此处只防"未写响应即抛"造成悬挂连接。
        this.logger.error(`BA handler error: ${(error as Error).message}`);
        if (!reply.raw.writableEnded) {
          reply.code(500);
          reply.send({ message: (error as Error).message });
        }
      }
    });
    this.logger.log(`Better Auth HTTP surface mounted at ${pattern} (Fastify instance-level)`);
  }

  private buildGenericConfigs() {
    const oauth = this.configService.getOAuthConfig();
    return buildGenericOAuthConfigs(oauth.genericProviders ?? [], oauth.secrets);
  }

  private buildSocialProviders(): BetterAuthOptions['socialProviders'] {
    const oauth = this.configService.getOAuthConfig();
    const providers = {} as NonNullable<BetterAuthOptions['socialProviders']>;
    for (const providerType of oauth.providers.filter((p) => p.enabled)) {
      if (!Object.values(OAuthProviderType).includes(providerType.type as OAuthProviderType)) {
        continue;
      }
      const config = oauth.secrets[providerType.type];
      if (!config?.clientId || !config.clientSecret) continue;
      (providers as Record<string, unknown>)[providerType.type] = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        ...Object.entries(config)
          .filter(([key]) => key !== 'clientId' && key !== 'clientSecret')
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
      };
    }
    return providers;
  }
}
