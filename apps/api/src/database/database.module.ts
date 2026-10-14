import { DOMAIN_EVENT_PUBLISHER } from '@core/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE } from '@core/shared-kernel/domain/event-store.port';
import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '../config/config.module';
import { DefaultDomainEventPublisher } from './domain-event-publisher';
import { DrizzleService } from './drizzle.service';
import { DrizzleEventStore } from './drizzle-event-store';

@Global()
@Module({
  imports: [ConfigModule, CqrsModule],
  providers: [
    DrizzleService,
    // ES 首切片（module-users-es-append）：端口倒置——core 只声明 EVENT_STORE /
    // DOMAIN_EVENT_PUBLISHER 契约，适配与实现在此装配并随 @Global exports 供
    // 各上下文就地解析（沿 S10 P1 tenancy 端口先例）。
    { provide: EVENT_STORE, useClass: DrizzleEventStore },
    { provide: DOMAIN_EVENT_PUBLISHER, useClass: DefaultDomainEventPublisher },
  ],
  exports: [DrizzleService, EVENT_STORE, DOMAIN_EVENT_PUBLISHER],
})
export class DatabaseModule {}
