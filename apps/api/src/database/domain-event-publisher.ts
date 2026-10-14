import { ConfigService } from '@app/config/config.service';
import type { DomainEvent } from '@core/saas-kit/shared-kernel/domain/domain-event';
import type { DomainEventPublisher } from '@core/saas-kit/shared-kernel/domain/event-publisher.port';
import { EVENT_STORE, type EventStore } from '@core/saas-kit/shared-kernel/domain/event-store.port';
import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';

/**
 * `DomainEventPublisher` 默认实现（ES 首切片 · module-users-es-append §2.3）。
 *
 * 双模顺序：`EVENT_STORE_ENABLED` 开则先向 event store 耐久 append，再进程内
 * publishAll（EDA Phase A 语义无条件保留）；append 失败**如实抛、不进总线**
 * （宁缺勿错发·审计流一致性优先，见 plan §4 弱一致窗口）。开关关时纯透传，
 * 行为与切片前逐字节等价。token 随 @Global DatabaseModule exports 装配。
 */
@Injectable()
export class DefaultDomainEventPublisher implements DomainEventPublisher {
  constructor(
    @Inject(EventBus) private readonly eventBus: EventBus,
    @Inject(EVENT_STORE) private readonly store: EventStore,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    if (this.configService.getEventStoreConfig().enabled) {
      await this.store.append(events);
    }
    this.eventBus.publishAll([...events]);
  }
}
