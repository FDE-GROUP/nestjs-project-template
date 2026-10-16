import 'reflect-metadata';
import { createValidationPipe } from '@app/common/validation-pipe';
import { Account, Session, User } from '@app/database/mikro/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module';

/**
 * BA HTTP 面接线 e2e（module-auth-http-surface·丁-1·env-gated）：
 * 真 HTTP 全链 sign-up → sign-in（BA 自签 cookie）→ get-session → sign-out → 会话失效，
 * 走 Fastify 实例级通配路由（`app.inject` 命中完整路由链）——补上租户隔离 e2e 头注自认的
 * 「Test harness 不复现 HTTP 中间件层」盲区：**接线不依赖 Nest 全局前缀/版本化**（实例级
 * 路由按 basePath 字面量注册），故本测可在裸 harness 下驱动真实 BA HTTP 端点。
 *
 * 兼锁丙·stub 清算：原 `/better-auth/*` stub 死面接线后仍 404（名实收口）。
 *
 * 默认跳过：仅当 `E2E_DATABASE_URL` 存在时运行（连接串取 `DATABASE_URL`，两者应同库），
 * 不破默认 CI 的 DB-free 不变量。夹具（user/session/account）afterAll 清净，时间戳唯一 email 幂等。
 */

const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

const PASSWORD = 'E2e-Pa55w0rd!';

gated('BA HTTP 面全链 e2e（真·原生端点经真 HTTP·env-gated）', () => {
  let app: NestFastifyApplication;
  let mikro: MikroOrmService;
  const stamp = Date.now();
  const email = `e2e-http-${stamp}@example.com`;
  let userId: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // 与生产入口同装配（global-ci-fullstack-pg 切片 A′：校验管单源见 common/validation-pipe.ts）。
    app.useGlobalPipes(createValidationPipe());
    await app.init();
    mikro = app.get(MikroOrmService);
  }, 120000);

  afterAll(async () => {
    if (!app) return;
    if (userId) {
      const em = await mikro.fork();
      await em.nativeDelete(Session, { userId } as never);
      await em.nativeDelete(Account, { userId } as never);
      await em.nativeDelete(User, { id: userId } as never);
    }
    await app.close();
  });

  it('sign-up/email：BA 原生端点经真 HTTP 可达（接线前整面 404 的翻案锁）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-up/email',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      payload: JSON.stringify({ email, password: PASSWORD, name: 'e2e-http' }),
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { user?: { id: string; email: string } };
    expect(body.user?.email).toBe(email);
    userId = body.user?.id;
  });

  it('sign-in → get-session → sign-out → 会话失效：cookie 全链真实', async () => {
    const signIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in/email',
      // BA CSRF 防线：cookie 写操作（sign-out 等）要求 Origin，缺失 403（实机坐实）
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      payload: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(signIn.statusCode).toBe(200);
    const setCookie = signIn.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie])
      .filter(Boolean)
      .map((c) => String(c).split(';')[0])
      .join('; ');
    expect(cookie).toMatch(/better-auth\.session_token/i);

    const getSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/get-session',
      headers: { cookie },
    });
    expect(getSession.statusCode).toBe(200);
    const sessionBody = JSON.parse(getSession.body) as { user?: { email: string } };
    expect(sessionBody.user?.email).toBe(email);

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-out',
      headers: { cookie, origin: 'http://localhost' },
    });
    expect(signOut.statusCode).toBe(200);

    // BA 1.7.7 实机语义：未认证 get-session 返 **200 + null**（非 401）；会话行已删=失效真实生效
    const afterSignOut = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/get-session',
      headers: { cookie },
    });
    expect(afterSignOut.statusCode).toBe(200);
    expect(JSON.parse(afterSignOut.body)).toBeNull();
  });

  it('丙·stub 清算锁：原 /better-auth/* 死面接线后仍 404（不复活、不冲突）', async () => {
    const res = await app.inject({ method: 'GET', url: '/better-auth/session' });
    expect(res.statusCode).toBe(404);
  });
});

/*
 * 本地跑法（沿用租户隔离 e2e 的专用 nestjs_e2e 库先例）：
 *   docker exec nestjs-pg-dev psql -U postgres -c "CREATE DATABASE nestjs_e2e;"          # 若不存在
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e pnpm run migration:run -- --fresh
 *   E2E_DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/nestjs_e2e \
 *     pnpm exec vitest run apps/api/src/modules/auth/auth-http-surface.e2e.test.ts
 */
