import { ConfigModule } from '@app/config/config.module';
import { DrizzleService } from '@app/database/drizzle.service';
import { SessionGuard } from '@app/modules/auth/guards/session.guard';
import { PostsController } from '@app/modules/posts/api/posts.controller';
import { PlatformOperatorGuard } from '@core/tenancy/platform/platform-operator.guard';
import { TenantPermissionGuard } from '@core/tenancy/rbac/tenant-permission.guard';
import { TenantScopeGuard } from '@core/tenancy/tenant-scope.guard';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';

/**
 * S9 补遗 · 全栈 e2e 分层之第一层：**DB-free 全应用 boot 冒烟**（NFR-7）。
 *
 * S9 的 `di-context.integration.test.ts` 只把 tenancy 那一条鉴权栈放进容器；这片把它升级为
 * **整个 `AppModule` 图**的解析冒烟——`Test.createTestingModule({ imports: [AppModule] })
 * .compile()` 会实例化全部 provider（含守卫/中间件/控制器/CQRS handler/仓储），任何一个因
 * `design:paramtypes` 元数据缺失或 token 未注册而无法解析，`compile()` 当场抛
 * `UnknownDependenciesException`。这正是 S9 抓到的守卫 bug 的**全局防线**：此前所有守卫/处理器
 * 测试都走手工 `new`，CI 又无真实容器 boot，故「整树能否起」从未被验证。
 *
 * **刻意不调用 `init()` / `listen()`**：`DrizzleService.onModuleInit` 会 `SELECT 1` 并在失败时
 * throw（真 HTTP e2e 才需要连库，见 tenant-isolation.e2e.test.ts）。此处只验依赖图装配，故用
 * `overrideProvider(DrizzleService)` 注入一个不连库的桩，保持本测 **DB-free**、可进默认 CI。
 */
describe('全 AppModule boot 冒烟（DI 图整树可解析 · DB-free · 进 CI）', () => {
  it('compile 整棵 AppModule 依赖图不抛 UnknownDependenciesException', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // 免连库：DrizzleService 的真实实例化由 S 各片的仓储单测覆盖；此处只验整树装配。
      .overrideProvider(DrizzleService)
      .useValue({ db: {}, onModuleDestroy: async () => {} })
      .compile();

    // 关键接线节点均可被容器解析出实例（这些是历片只手工 new、从未走真实 DI 的类）。
    expect(moduleRef.get(TenantScopeGuard)).toBeInstanceOf(TenantScopeGuard);
    expect(moduleRef.get(TenantPermissionGuard)).toBeInstanceOf(TenantPermissionGuard);
    expect(moduleRef.get(PlatformOperatorGuard)).toBeInstanceOf(PlatformOperatorGuard);
    expect(moduleRef.get(SessionGuard)).toBeInstanceOf(SessionGuard);
    expect(moduleRef.get(PostsController)).toBeInstanceOf(PostsController);
    // 全局配置面也在图中就绪（ConfigModule 为 @Global，供跨模块 getter 解析）。
    expect(moduleRef.get(ConfigModule)).toBeInstanceOf(ConfigModule);
  });
});
