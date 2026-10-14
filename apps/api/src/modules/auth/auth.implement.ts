import type { QuotaService } from '@core/tenancy/quota/quota.service';
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
import { createSeatsQuotaPlugin } from './seats-quota.hook';
import { tenantAccessControl, tenantRoles } from './tenancy-access-control';

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
      // 建租户唯一通道（S4 · FR-1）：透传 organization 插件 createOrganization（服务端系统动作）。
      createOrganization: (params: any) => Promise<any>;
      // 服务端登录编排面（S9 补遗 · 真·BA 登录 e2e 及系统侧用户开通复用）：透传 better-auth 原生
      // signUpEmail / signInEmail / organization set-active，配合 `asResponse:true` 由 BA 自身签发
      // 真实 session cookie（含签名）——与 createOrganization 同一「服务端编排网关」范式，加法式暴露。
      signUpEmail: (params: any) => Promise<any>;
      signInEmail: (params: any) => Promise<any>;
      setActiveOrganization: (params: any) => Promise<any>;
      // S7 收尾 · 成员入组双端点透传（服务端编排面·e2e 驱动用）：dispatch.mjs 坐实
      // auth.api.* 与 router 走同一 hooks pipeline，seats 配额 hook 同样生效。
      // 邀请发出端点：server key 为 createInvitation（HTTP path 才是 /organization/invite-member）。
      createInvitation: (params: any) => Promise<any>;
      acceptInvitation: (params: any) => Promise<any>;
    };
  };
}

export function CreateAuth(
  providers: BetterAuthOptions['socialProviders'],
  genericConfigs: GenericOAuthConfig[],
  drizzleService: DrizzleService,
  configService: ConfigService,
  quota: Pick<QuotaService, 'checkSeats'>,
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
      // 权限源（禁散点·§9.3），由 TenantPermissionGuard 经 `TenantPermissionChecker` 端口（适配落 BA
      // hasPermission·§9.5.4①B P1b）判定。S3 扩展 ac
      // 增 `workspace` 资源（read=全成员·create/update/delete=owner+admin），roles 精确镜像
      // BA 默认集再叠加 workspace（见 modules/auth/tenancy-access-control.ts），故既有 org 端点行为不变。
      // S4（FR-1 审批制）：`allowUserToCreateOrganization: false` 封死 HTTP 自助即时开通
      // （任何会话调 /organization/create 一律 403·ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED…）；
      // 建租户唯一通道 = 服务端系统动作（无 session + body.userId → isSystemAction·源码坐实不受
      // 此开关限），由 tenants 申请端点独享（强制 metadata.status=pending_approval）。
      organization({
        ac: tenantAccessControl,
        roles: tenantRoles,
        allowUserToCreateOrganization: false,
      }),
      // S7 收尾（vision §7 阶段 2 商业闭环）：成员增量端点（accept-invitation 为现网唯一真实
      // HTTP 通道）经插件级 before-hook 走 seats 配额前置校验，超限 402（详 seats-quota.hook.ts）。
      createSeatsQuotaPlugin({ quota, db: drizzleService.db }),
    ],
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'github'],
      },
    },
    // 邮箱+密码登录面（S9 补遗 · 真·BA 登录编排 e2e 依赖）：**仅在非生产环境启用**
    // （`NODE_ENV!=='production'`）——生产安全面零改动（仍关），test/dev 开启以驱动真实
    // signUp/signIn 编排。补齐「邮箱为体」CN 登录面进生产属独立产品决策（D8 排序/验证/策略），不在此预置。
    emailAndPassword: {
      enabled: process.env.NODE_ENV !== 'production',
      autoSignIn: true,
      minPasswordLength: 8,
    },
    appName: appConfig.name || 'NestJS SaaS Start',
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
        // S4 · FR-1：申请建租户的服务端系统动作（无 session + body.userId → isSystemAction），
        // 绕过 HTTP 层 `allowUserToCreateOrganization:false` 封禁，由 tenants 申请端点独享。
        createOrganization(params: Parameters<typeof auth.api.createOrganization>[0]) {
          return auth.api.createOrganization(params);
        },
        // S9 补遗 · 真·BA 登录编排：透传 better-auth 原生邮箱注册/登录 + 组织切换（服务端系统侧）。
        // e2e/系统开通以 `{ body, asResponse: true }` 调用即得 BA 自签的真实 session cookie，供后续请求回放。
        signUpEmail(params: Parameters<typeof auth.api.signUpEmail>[0]) {
          return auth.api.signUpEmail(params);
        },
        signInEmail(params: Parameters<typeof auth.api.signInEmail>[0]) {
          return auth.api.signInEmail(params);
        },
        setActiveOrganization(params: any) {
          return (auth.api as any).setActiveOrganization(params);
        },
        // S7 收尾 · 邀请发出/接受（member 行落行时点）：服务端透传同样经 dispatch 的 hooks
        // pipeline（seats 配额 hook 不区分 HTTP/服务端通道），e2e 以此驱动真实入组流程。
        createInvitation(params: any) {
          return (auth.api as any).createInvitation(params);
        },
        acceptInvitation(params: any) {
          return (auth.api as any).acceptInvitation(params);
        },
      },
    },
  };
}
