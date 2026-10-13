import {
  BetterAuthError,
  type BetterAuthOptions,
  type BetterAuthPlugin,
  betterAuth,
} from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { toNodeHandler } from 'better-auth/node';
import { type GenericOAuthConfig, genericOAuth, organization } from 'better-auth/plugins';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '../../config/config.service';
import type { DrizzleService } from '../../database/drizzle.service';
import * as schema from '../../database/schema';
import { tenantAccessControl, tenantRoles } from '../../tenancy/rbac/access-control';

export type AuthRequest = FastifyRequest & { originalUrl?: string; url?: string };
export type AuthResponse = FastifyReply;

export interface CreateAuthResult {
  handler: (req: AuthRequest, res: AuthResponse) => Promise<any>;
  auth: {
    options: any;
    api: {
      getSession: (params: any) => Promise<any>;
      getProviders: () => string[];
      listUserAccounts: (params: any) => Promise<any>;
      // 租户级 RBAC 判定（S1 · FR-4）：透传 Better Auth organization 插件的 hasPermission，
      // 以 ac + roles 为唯一权限源，供 TenantPermissionGuard 调用。
      hasPermission: (params: any) => Promise<any>;
    };
  };
}

export function CreateAuth(
  providers: BetterAuthOptions['socialProviders'],
  genericConfigs: GenericOAuthConfig[],
  drizzleService: DrizzleService,
  configService: ConfigService,
): CreateAuthResult {
  const appConfig = configService.getAppConfig();
  const authConfig = configService.getAuthConfig();
  const corsConfig = configService.getCorsConfig();
  const basePath = `/${appConfig.apiPrefix}/${appConfig.version}/auth`;

  const auth = betterAuth({
    database: drizzleAdapter(drizzleService.db, {
      provider: 'pg',
      schema,
    }),
    socialProviders: providers,
    basePath: basePath,
    trustedOrigins: Array.isArray(corsConfig.origin)
      ? corsConfig.origin
      : corsConfig.origin?.split(',') || [],
    plugins: [
      // Session provider tracking plugin
      {
        id: 'add-account-to-session',
        hooks: {
          after: [
            {
              matcher(context) {
                return context.path?.startsWith('/callback') ?? false;
              },
              handler: createAuthMiddleware(async (ctx) => {
                const provider = ctx.params?.id || ctx.path.split('/callback')[1];
                if (!provider) {
                  return;
                }

                let finalSessionId = '';
                const sessionCookie = ctx.getHeader(ctx.context.authCookies.sessionToken.name);

                if (sessionCookie) {
                  const sessionId = sessionCookie.split('.')[0];
                  if (sessionId) {
                    finalSessionId = sessionId;
                  }
                }

                if (!finalSessionId) {
                  const setSessionToken = ctx.getHeader('set-cookie');

                  if (setSessionToken) {
                    const sessionId = setSessionToken.split(';')[0].split('=')[1].split('.')[0];

                    if (sessionId) {
                      finalSessionId = sessionId;
                    }
                  }
                }

                if (!finalSessionId) {
                  return;
                }

                try {
                  // Use a more compatible approach by storing the info in context metadata
                  // which won't trigger type errors with the session object
                  const metadata = (ctx.context as any).metadata || {};
                  metadata.provider = provider;
                  (ctx.context as any).metadata = metadata;

                  // Log the action instead of trying to update DB directly
                  await Promise.resolve(); // for eslint
                  console.log(`Session ${finalSessionId} associated with provider ${provider}`);
                } catch (error) {
                  console.error('Failed to store provider information:', error);
                }
              }),
            },
          ],
        },
        schema: {
          session: {
            fields: {
              provider: {
                type: 'string',
                required: false,
              },
            },
          },
        },
      } satisfies BetterAuthPlugin,
      // 境内登录渠道（方案 C · FR-3/A1）：有配置才挂 genericOAuth 插件（NFR-2 未配即降级）
      ...(genericConfigs.length > 0 ? [genericOAuth({ config: genericConfigs })] : []),
      // 多租户（混合复用 · S0/S1/S3）：org 插件承载 tenant/member/invitation + RBAC，
      // 并将 activeOrganizationId 落到 session（D4 session-cookie）。以 ac + roles 为唯一
      // 权限源（禁散点·§9.3），由 TenantPermissionGuard 经 hasPermission 判定。S3 扩展 ac
      // 增 `workspace` 资源（read=全成员·create/update/delete=owner+admin），roles 精确镜像
      // BA 默认集再叠加 workspace（见 rbac/access-control.ts），故既有 org 端点行为不变。
      // 审批制创建租户（FR-1）留 S4。
      organization({ ac: tenantAccessControl, roles: tenantRoles }),
    ],
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    appName: appConfig.name || 'nestjs-project-template',
    secret: authConfig.jwt.secret,
    user: {
      additionalFields: {
        isOwner: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
        handle: {
          type: 'string',
          defaultValue: '',
        },
      },
    },
  });

  const handler = async (req: AuthRequest, res: AuthResponse) => {
    try {
      res.header('access-control-allow-methods', 'GET, POST');
      res.header('access-control-allow-headers', 'content-type');
      res.header(
        'Access-Control-Allow-Origin',
        req.headers.origin || req.headers.referer || req.headers.host || '*',
      );
      res.header('access-control-allow-credentials', 'true');

      // Handle Fastify requests
      const url = req.originalUrl || req.url || req.raw.url;
      if (!url) {
        throw new Error('Request URL is missing');
      }

      // Use the original request directly instead of cloning to prevent property loss
      // Set only the necessary properties that need to be modified
      req.url = url;
      req.originalUrl = url; // Ensure originalUrl is set for better-auth

      // Only modify socket encryption if needed, don't replace the entire socket
      if (req.raw && req.raw.socket) {
        // Use type assertion since the socket may be from different request types
        (req.raw.socket as any).encrypted = true;
      }

      const handler = toNodeHandler(auth)(req.raw, res.raw);

      return handler;
    } catch (error) {
      console.error(error);
      // throw error
      return res.code(500).send((error as any).message);
    }
  };

  return {
    handler,
    auth: {
      options: auth.options,
      api: {
        getSession(params: Parameters<typeof auth.api.getSession>[0]) {
          return auth.api.getSession(params);
        },
        getProviders() {
          return [
            ...Object.keys(auth.options.socialProviders || {}),
            ...genericConfigs.map((c) => c.providerId),
          ];
        },
        async listUserAccounts(params: Parameters<typeof auth.api.listUserAccounts>[0]) {
          try {
            const result = await auth.api.listUserAccounts(params);
            return result;
          } catch (error) {
            if (error instanceof BetterAuthError) {
              return null;
            }
            throw error;
          }
        },
        hasPermission(params: Parameters<typeof auth.api.hasPermission>[0]) {
          return auth.api.hasPermission(params);
        },
      },
    },
  };
}
