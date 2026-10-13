import 'reflect-metadata';
import { ConfigService } from '@app/config/config.service';
import { DrizzleService } from '@app/database/drizzle.service';
import { AuthInstanceInjectKey } from '@app/modules/auth/auth.constant';
import { SessionGuard } from '@app/modules/auth/guards/session.guard';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TenantStatusService } from './lifecycle/tenant-status.service';
import { UserStatusService } from './lifecycle/user-status.service';
import { PlatformOperatorGuard } from './platform/platform-operator.guard';
import { TenantPermissionGuard } from './rbac/tenant-permission.guard';
import { TenantMiddleware } from './tenant.middleware';
import { TenantContextService } from './tenant-context.service';
import { TenantScopeGuard } from './tenant-scope.guard';

/**
 * S9 · NFR-7 DI / 租户上下文集成测试（对齐 `design:paramtypes` 回归）。
 *
 * 覆盖历片一直**未被真实 DI 容器**验证的接线面：`TenancyModule` 的守卫/中间件此前全部经
 * `new Guard(...)` 手工实例化单测（矩阵/越界），`app.module.test.ts` 只做 `import()` 冒烟——
 * 二者都不触发 Nest 依 `design:paramtypes` 解析构造依赖。本切片把整条鉴权栈放进真实
 * `Test.createTestingModule`，锁死两件事：
 *
 * 1. **元数据擦除防线**（`import type` 陷阱）：`TenantScopeGuard`（裸 `TenantContextService`）与
 *    `TenantPermissionGuard`（裸 `Reflector`+`TenantContextService`）的构造参数**无 `@Inject` token**，
 *    完全依赖 unplugin-swc 的 `emitDecoratorMetadata` 在 Vitest 下发出真实类。一旦被误改成纯类型导入
 *    擦除（metadata 变 `Object`），DI 当场崩、`design:paramtypes` 断言先红。
 * 2. **ALS 端到端传播**：真实 `TenantMiddleware` 把 `activeOrganizationId`/`x-workspace-id` 绑进
 *    AsyncLocalStorage，`next()` 内读到的即守卫将读到的同一上下文；deny-list（无 cookie / 暂停租户）
 *    回落到「无租户」→ `TenantScopeGuard` fail-closed 403。
 *
 * 刻意**不做** HTTP 全栈往返（`app.inject` 打真实路由）——那属仍在挂账的「全栈 e2e」，需真实
 * session/CSRF；此处聚焦 DI 解析 + ALS 传播，二者恰是历片测试的盲区。
 */

interface FakeSession {
  session?: { activeOrganizationId?: string };
  user?: { id?: string; email?: string };
}

/** 提供 AuthInstanceInjectKey 的桩：`.get()` 返回带 `api.getSession` 的对象（守卫做 `auth.api.xxx`）。 */
function authStub(session: FakeSession | null) {
  return {
    get: () => (session ? { api: { getSession: async () => session } } : undefined),
    set: () => {},
  };
}

function drizzleStub() {
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    },
  };
}

function configStub(email = 'admin@x.com') {
  return { getPlatformConfig: () => ({ operatorEmail: email }) };
}

/** 在 ALS 作用域内驱动真实中间件，回传 next() 执行期间的观测值。 */
function driveMiddleware(
  mw: TenantMiddleware,
  req: Record<string, unknown>,
  observe: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    mw.use(req, {}, () => {
      try {
        observe();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

describe('S9 · Tenancy DI / 上下文集成（design:paramtypes 回归 + ALS 传播）', () => {
  describe('① design:paramtypes 元数据回归（裸类型注入不受 import type 擦除影响）', () => {
    it('TenantScopeGuard 第一构造参数携带真实 TenantContextService 类（非 Object）', () => {
      const types = Reflect.getMetadata('design:paramtypes', TenantScopeGuard) as unknown[];
      expect(types[0]).toBe(TenantContextService);
    });

    it('TenantPermissionGuard 前两参携带真实 Reflector / TenantContextService（无 token，纯元数据解析）', () => {
      const types = Reflect.getMetadata('design:paramtypes', TenantPermissionGuard) as unknown[];
      expect(types[0]).toBe(Reflector);
      expect(types[1]).toBe(TenantContextService);
      // 第三参 authInstance 经 @Inject(AuthInstanceInjectKey) token 注入，元数据可为 Object（属预期）。
    });
  });

  describe('② 真实 Nest DI 容器解析整条鉴权栈（.get() 触发实例化，元数据缺失即崩）', () => {
    it('守卫/中间件均可由容器无手工 new 解析出实例', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TenantContextService,
          TenantScopeGuard,
          TenantPermissionGuard,
          PlatformOperatorGuard,
          SessionGuard,
          TenantMiddleware,
          Reflector,
          { provide: AuthInstanceInjectKey, useValue: authStub(null) },
          { provide: DrizzleService, useValue: drizzleStub() },
          { provide: ConfigService, useValue: configStub() },
          { provide: UserStatusService, useValue: { isBlocked: async () => false } },
          { provide: TenantStatusService, useValue: { isBlocked: async () => false } },
        ],
      }).compile();

      // 解析（非 merely 注册）会执行构造，依赖不满足则 Nest 抛 "can't resolve"。
      expect(moduleRef.get(TenantContextService)).toBeInstanceOf(TenantContextService);
      expect(moduleRef.get(TenantScopeGuard)).toBeInstanceOf(TenantScopeGuard);
      expect(moduleRef.get(TenantPermissionGuard)).toBeInstanceOf(TenantPermissionGuard);
      expect(moduleRef.get(PlatformOperatorGuard)).toBeInstanceOf(PlatformOperatorGuard);
      expect(moduleRef.get(SessionGuard)).toBeInstanceOf(SessionGuard);
      expect(moduleRef.get(TenantMiddleware)).toBeInstanceOf(TenantMiddleware);
    });
  });

  describe('③ ALS 端到端传播：真实 TenantMiddleware → TenantScopeGuard / TenantContextService', () => {
    let tcs: TenantContextService;
    let scope: TenantScopeGuard;
    let mw: TenantMiddleware;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TenantContextService,
          TenantScopeGuard,
          TenantMiddleware,
          {
            provide: AuthInstanceInjectKey,
            useValue: authStub({ session: { activeOrganizationId: 'org_1' }, user: { id: 'u1' } }),
          },
          { provide: UserStatusService, useValue: { isBlocked: async () => false } },
          { provide: TenantStatusService, useValue: { isBlocked: async () => false } },
        ],
      }).compile();
      tcs = moduleRef.get(TenantContextService);
      scope = moduleRef.get(TenantScopeGuard);
      mw = moduleRef.get(TenantMiddleware);
    });

    it('携带会话 cookie + x-workspace-id → 中间件绑 tenant/workspace 进 ALS，守卫同请求内放行', async () => {
      const req = { headers: { cookie: 'session=abc', 'x-workspace-id': 'ws_9' }, url: '/posts' };
      const seen: { tenant?: string; workspace?: string; ok?: boolean; required?: string } = {};

      await driveMiddleware(mw, req, () => {
        seen.tenant = tcs.tenantId;
        seen.workspace = tcs.workspaceId;
        seen.required = tcs.requireTenantId();
        // TenantScopeGuard 读同一 ALS store（canActivate 忽略 context 参数）。
        seen.ok = scope.canActivate({} as never);
      });

      expect(seen.tenant).toBe('org_1');
      expect(seen.workspace).toBe('ws_9');
      expect(seen.required).toBe('org_1');
      expect(seen.ok).toBe(true);
    });

    it('无 cookie（公开/旁路路径）→ 中间件不绑 ALS → TenantScopeGuard fail-closed 403', async () => {
      const req = { headers: {}, url: '/posts' };
      let thrown: unknown = null;
      let tenantInView: string | undefined = 'sentinel';

      await driveMiddleware(mw, req, () => {
        tenantInView = tcs.tenantId;
        try {
          scope.canActivate({} as never);
        } catch (err) {
          thrown = err;
        }
      });

      expect(tenantInView).toBeUndefined();
      expect(thrown).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('④ deny-list 暂停租户经真实中间件失能（S4/S6 接线在 ALS 层坐实）', () => {
    it('租户被暂停（tenantStatus.isBlocked=true）→ 中间件绑空 → 守卫 403', async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [
          TenantContextService,
          TenantScopeGuard,
          TenantMiddleware,
          {
            provide: AuthInstanceInjectKey,
            useValue: authStub({
              session: { activeOrganizationId: 'org_susp' },
              user: { id: 'u2' },
            }),
          },
          { provide: UserStatusService, useValue: { isBlocked: async () => false } },
          { provide: TenantStatusService, useValue: { isBlocked: async () => true } },
        ],
      }).compile();
      const tcs = moduleRef.get(TenantContextService);
      const scope = moduleRef.get(TenantScopeGuard);
      const mw = moduleRef.get(TenantMiddleware);

      const req = { headers: { cookie: 'session=abc' }, url: '/posts' };
      let thrown: unknown = null;
      let tenantInView: string | undefined = 'sentinel';

      await driveMiddleware(mw, req, () => {
        tenantInView = tcs.tenantId;
        try {
          scope.canActivate({} as never);
        } catch (err) {
          thrown = err;
        }
      });

      expect(tenantInView).toBeUndefined();
      expect(thrown).toBeInstanceOf(ForbiddenException);
    });
  });
});
