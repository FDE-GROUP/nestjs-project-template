import { DOMAIN_EVENT_PUBLISHER } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '../config/config.module';
import { DefaultDomainEventPublisher } from './domain-event-publisher';
import { DrizzleService } from './drizzle.service';
import { MikroEventStore } from './mikro-event-store';

@Global()
@Module({
  imports: [ConfigModule, CqrsModule],
  providers: [
    DrizzleService,
    // ES 首切片（module-users-es-append）：端口倒置——core 只声明 EVENT_STORE /
    // DOMAIN_EVENT_PUBLISHER 契约，适配与实现在此装配并随 @Global exports 供
    // 各上下文就地解析（沿 S10 P1 tenancy 端口先例）。
    // ORM 修宪案 B · 切片 3c-ii-C：EVENT_STORE 绑定改指 MikroEventStore（MikroOrmService 由
    // @Global MikroOrmModule 供给·懒建不劫持 DB-free 装配冒烟）；旧 DrizzleEventStore 类不删作
    // 回滚点（切片 4 contract 阶段随 Drizzle 依赖一并收口）。
    { provide: EVENT_STORE, useClass: MikroEventStore },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: DefaultDomainEventPublisher },
  ],
  exports: [DrizzleService, EVENT_STORE, DOMAIN_EVENT_PUBLISHER],
})
export class DatabaseModule {}
