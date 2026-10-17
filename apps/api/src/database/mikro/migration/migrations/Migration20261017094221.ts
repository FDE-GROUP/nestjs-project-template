import { Migration } from '@mikro-orm/migrations';

export class Migration20261017094221 extends Migration {
  override name = 'Migration20261017094221';

  override up(): void | Promise<void> {
    this.addSql(`alter table "workspace" add "ownerId" text null;`);
    this.addSql(
      `create index "workspace_org_owner_idx" on "workspace" ("organizationId", "ownerId");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "workspace_org_owner_idx";`);
    this.addSql(`alter table "workspace" drop column "ownerId";`);
  }
}
