import 'reflect-metadata';
import { DrizzleService } from '@app/database/drizzle.service';
import { organization, post } from '@app/database/schema';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';

/**
 * S9 补遗 · 全栈 e2e 分层之第二层：**真 HTTP 端到端打穿租户隔离路由**（NFR-7 / FR-5）。
 *
 * 与 `app-boot.smoke.test.ts`（DB-free、只验 DI 图装配）互补——本测把**整条真实链路**跑起来：
 * Fastify 收请求 → `TenantMiddleware` 经 `getSession` 解析 `activeOrganizationId` 绑进 ALS →
 * `TenantScopeGuard` fail-closed → `PostsController` → CQRS → **真实 Drizzle 查询注入
 * `organizationId` 谓词** → `TransformInterceptor` 包装响应。断言**跨租户互不可见**：org_a 只
 * 见自己的帖子、org_b 只见自己的，无 cookie 直接 403。**并补越界负向路径**（FR-5/NFR-1 红线）：
 * 伪造 body `organizationId` 写→仍被强制盖可信租户、对端租户绝不可见；伪造 `x-workspace-id`
 * 选择器读→复合作用域恒 0 行、无法括宽/泄漏。
 *
 * **刻意只在认证令牌边界打桩**（override `AuthInstanceInjectKey` 让 `getSession` 依 cookie
 * 返回固定 session），其余（守卫/中间件/CQRS/仓储/Fastify/Drizzle）全是真实件——真实 Better Auth
 * email/password 登录 + session cookie 编排留给「全栈 CI 拼 PG」专项，不在本片范围。
 *
 * **默认跳过**：需一个已 migrate 的真实 Postgres。仅当 `E2E_DATABASE_URL` 存在时运行（它作开关），
 * 真正的连接串取 `DATABASE_URL`（两者应指向同一个库），故不破默认 CI 的 DB-free 不变量。本地执行：
 *   `E2E_DATABASE_URL=<url> DATABASE_URL=<url> bunx vitest run src/tenancy/tenant-isolation.e2e.test.ts`
 */
const E2E_DB = process.env.E2E_DATABASE_URL;

const ORG_A = 'e2e_org_a';
const ORG_B = 'e2e_org_b';
const POST_A = 'e2e_post_a';
const POST_B = 'e2e_post_b';
const COOKIE_A = 'e2e_session=org_a';
const COOKIE_B = 'e2e_session=org_b';

/** cookie → Better Auth session 形状（仅供 TenantMiddleware 解析）。 */
const SESSIONS: Record<
  string,
  { user: { id: string }; session: { activeOrganizationId: string } }
> = {
  [COOKIE_A]: { user: { id: 'e2e_user_a' }, session: { activeOrganizationId: ORG_A } },
  [COOKIE_B]: { user: { id: 'e2e_user_b' }, session: { activeOrganizationId: ORG_B } },
};

const gated = E2E_DB ? describe : describe.skip;

gated('租户隔离全栈 e2e（真实 HTTP · 真守卫/中间件/仓储 · env-gated）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    // 真实 DrizzleService 连的是 shell 传入的 `DATABASE_URL`（vitest.config 现尊重外部值）；
    // `E2E_DATABASE_URL` 仅作本测的运行开关（gate），指向同一个已 migrate 的库。
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthInstanceInjectKey)
      .useValue({
        get: () => ({
          api: {
            getSession: async ({ headers }: { headers?: Record<string, string> }) =>
              SESSIONS[headers?.cookie ?? ''] ?? null,
          },
        }),
        set: () => {},
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();

    // 夹具：两个 organization + 各挂一篇带 organizationId 的 post（真实 INSERT，验证仓储谓词）。
    const db = app.get(DrizzleService).db;
    const now = new Date();
    await db
      .insert(organization)
      .values([
        { id: ORG_A, name: 'E2E Org A', slug: 'e2e-org-a' },
        { id: ORG_B, name: 'E2E Org B', slug: 'e2e-org-b' },
      ])
      .onConflictDoNothing();
    await db
      .insert(post)
      .values([
        {
          id: POST_A,
          title: 'E2E-POST-ALPHA',
          published: true,
          organizationId: ORG_A,
          updatedAt: now,
        },
        {
          id: POST_B,
          title: 'E2E-POST-BRAVO',
          published: true,
          organizationId: ORG_B,
          updatedAt: now,
        },
      ])
      .onConflictDoNothing();
  }, 60000);

  afterAll(async () => {
    if (app) {
      const db = app.get(DrizzleService).db;
      // post.organizationId FK cascade → 删 org 连带删其 post 夹具。
      await db.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
      await app.close();
    }
  });

  const list = (cookie?: string, extraHeaders?: Record<string, string>) =>
    app.inject({
      method: 'GET',
      url: '/posts',
      headers: { ...(cookie ? { cookie } : {}), ...(extraHeaders ?? {}) },
    });

  /** POST 创建（body 允许携带伪造的 organizationId/workspaceId·验证被忽略/强制回可信 ctx）。 */
  const create = (cookie: string, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/posts',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(body),
    });

  it('无 session cookie → TenantMiddleware 不绑租户 → TenantScopeGuard fail-closed 403', async () => {
    const res = await list();
    expect(res.statusCode).toBe(403);
  });

  it('org_a cookie → 只见 ALPHA、绝不含 BRAVO（跨租户互不可见）', async () => {
    const res = await list(COOKIE_A);
    expect(res.statusCode).toBe(200);
    const body = res.body;
    expect(body).toContain('E2E-POST-ALPHA');
    expect(body).not.toContain('E2E-POST-BRAVO');
  });

  it('org_b cookie → 只见 BRAVO、绝不含 ALPHA（隔离对称）', async () => {
    const res = await list(COOKIE_B);
    expect(res.statusCode).toBe(200);
    const body = res.body;
    expect(body).toContain('E2E-POST-BRAVO');
    expect(body).not.toContain('E2E-POST-ALPHA');
  });

  it('负向·越界写：org_a 伪造 body organizationId=ORG_B 创建 → 仍盖 ORG_A，org_b 绝不可见', async () => {
    const res = await create(COOKIE_A, {
      title: 'E2E-WRITE-A',
      published: true,
      // 以下均为越界伪造尝试：控制器只读 title/content/published，organizationId 由可信 ctx 强制。
      organizationId: ORG_B,
      workspaceId: 'ws_forged',
    });
    expect(res.statusCode).toBe(201);

    // org_a 可见自己刚创建的帖子。
    const a = await list(COOKIE_A);
    expect(a.body).toContain('E2E-WRITE-A');
    // 关键：org_b **绝不应**看到这条试图伪造归属到它的帖子（跨租写重定向失效）。
    const b = await list(COOKIE_B);
    expect(b.body).not.toContain('E2E-WRITE-A');
  });

  it('负向·越界读：org_a 伪造 x-workspace-id 选择器不能括宽/泄漏（复合作用域 → 0 行）', async () => {
    // ALPHA 属于 ORG_A 且 workspaceId=null；携任意 foreign ws 选择器后 (ORG_A ∧ ws=foreign) 恒 0 行，
    // 证明 organizationId 谓词恒取可信 ctx、外部选择器至多匹配 0 行、无法跨租读取。
    const res = await list(COOKIE_A, { 'x-workspace-id': 'ws_of_other_tenant' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('E2E-POST-ALPHA');
  });
});
