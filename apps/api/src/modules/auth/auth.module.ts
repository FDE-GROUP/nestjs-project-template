import { ConfigModule } from '@app/config/config.module';
import { DatabaseModule } from '@app/database/database.module';
import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type Provider,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthInstanceInjectKey } from './auth.constant';
import { AuthController } from './auth.controller';
import type { AuthInstance } from './auth.interface';
import { AuthMiddleware } from './auth.middleware';
import { AuthService } from './auth.service';
import { SessionGuard } from './guards/session.guard';

@Module({})
export class AuthModule implements NestModule {
  static forRoot(): DynamicModule {
    const authProvider: Provider = {
      provide: AuthInstanceInjectKey,
      useFactory: () => {
        let auth: AuthInstance;
        return {
          get() {
            return auth;
          },
          set(value: AuthInstance) {
            auth = value;
          },
        };
      },
    };

    return {
      module: AuthModule,
      imports: [ConfigModule, DatabaseModule],
      providers: [
        AuthService,
        SessionGuard,
        authProvider,
        // S11 · 高危#4 收口：全局会话墙（deny-by-default）。SessionGuard 已在本模块 provide，
        // 其依赖（AuthInstanceInjectKey 本地 · UserStatusService 经 @Global TenancyModule）均可解析；
        // useExisting 复用同一实例。@Public() 路由经 Reflector 旁路。
        { provide: APP_GUARD, useExisting: SessionGuard },
      ],
      controllers: [AuthController],
      exports: [AuthService, SessionGuard, authProvider],
      global: true,
    };
  }

  configure(consumer: MiddlewareConsumer) {
    // Configure routes to match all possible auth path patterns
    consumer
      .apply(AuthMiddleware)
      .forRoutes(
        '*prefix/auth/*path',
        'auth/*path',
        'api/*prefix/auth/*path',
        '*prefix/*module/auth/*path',
        'api/*prefix/auth',
      );

    consumer.apply(AuthMiddleware).exclude();
  }
}
