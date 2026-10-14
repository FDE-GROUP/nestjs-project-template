import type { DomainEvent } from '@core/shared-kernel/domain/domain-event';
import type { EventStore } from '@core/shared-kernel/domain/event-store.port';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DrizzleService } from './drizzle.service';
import { event } from './schema';

/**
 * `EventStore` 端口的 Drizzle 适配（ES 首切片 · module-users-es-append §2.2）。
 *
 * shadow append：CRUD 仍是唯一真相源，本适配只把 DomainEvent 信封耐久落 `event` 表。
 * `version`（聚合内序号）由适配器按 max+1 递增取得——领域信封首切片不动（`eventVersion`
 * 是 schema 版本，非序号，见 plan §6 审计改动）；并发窗口由唯一键
 * (aggregateType, aggregateId, version) 兜底 fail-loud。空批 noop；落库错误如实抛。
 */
@Injectable()
export class DrizzleEventStore implements EventStore {
  constructor(@Inject(DrizzleService) private readonly drizzleService: DrizzleService) {}

  async append(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    for (const domainEvent of events) {
      const version = await this.nextVersion(domainEvent.aggregateType, domainEvent.aggregateId);
      await this.drizzleService.db.insert(event).values({
        eventId: domainEvent.eventId,
        aggregateId: domainEvent.aggregateId,
        aggregateType: domainEvent.aggregateType,
        version,
        eventType: domainEvent.eventType,
        eventVersion: domainEvent.eventVersion,
        payload: domainEvent.payload,
        metadata: {
          correlationId: domainEvent.correlationId ?? null,
          causationId: domainEvent.causationId ?? null,
        },
        occurredAt: domainEvent.occurredAt,
      });
    }
  }

  private async nextVersion(aggregateType: string, aggregateId: string): Promise<number> {
    const rows = await this.drizzleService.db
      .select({ version: event.version })
      .from(event)
      .where(and(eq(event.aggregateType, aggregateType), eq(event.aggregateId, aggregateId)))
      .orderBy(desc(event.version))
      .limit(1);
    return (rows[0]?.version ?? 0) + 1;
  }
}
