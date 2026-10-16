import { Migration } from '@mikro-orm/migrations';

export class Migration20261016181722_add_event_outbox_columns extends Migration {
  override name = 'Migration20261016181722_add_event_outbox_columns';

  override up(): void | Promise<void> {
    this.addSql(
      `alter table "event" add "dispatchedAt" timestamp null, add "attemptCount" int not null default 0, add "lastError" text null;`,
    );
    this.addSql(`create index "event_dispatched_idx" on "event" ("dispatchedAt");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "event_dispatched_idx";`);
    this.addSql(
      `alter table "event" drop column "dispatchedAt", drop column "attemptCount", drop column "lastError";`,
    );
  }
}
