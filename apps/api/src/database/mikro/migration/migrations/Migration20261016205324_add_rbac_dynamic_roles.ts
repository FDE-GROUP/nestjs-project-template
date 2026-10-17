import { Migration } from '@mikro-orm/migrations';

export class Migration20261016205324_add_rbac_dynamic_roles extends Migration {
  override name = 'Migration20261016205324_add_rbac_dynamic_roles';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "tenant_role" ("id" text not null, "organizationId" text not null, "key" text not null, "name" text not null, "isSystem" boolean not null default false, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "tenant_role" add constraint "tenant_role_org_key_idx" unique ("organizationId", "key");`,
    );

    this.addSql(
      `create table "tenant_role_grant" ("id" bigserial primary key, "roleId" text not null, "subject" text not null, "action" text not null, "conditions" jsonb null, "createdAt" timestamp not null default now());`,
    );
    this.addSql(
      `create index "tenant_role_grant_role_subject_idx" on "tenant_role_grant" ("roleId", "subject");`,
    );

    this.addSql(
      `create table "tenant_role_audit" ("id" bigserial primary key, "organizationId" text not null, "actorId" text null, "action" text not null, "roleKey" text not null, "before" jsonb null, "after" jsonb null, "createdAt" timestamp not null default now());`,
    );
    this.addSql(
      `create index "tenant_role_audit_org_created_idx" on "tenant_role_audit" ("organizationId", "createdAt");`,
    );

    this.addSql(
      `alter table "tenant_role" add constraint "tenant_role_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "tenant_role_grant" add constraint "tenant_role_grant_roleId_foreign" foreign key ("roleId") references "tenant_role" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "tenant_role_audit" add constraint "tenant_role_audit_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "tenant_role_audit" add constraint "tenant_role_audit_actorId_foreign" foreign key ("actorId") references "user" ("id") on delete set null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "tenant_role_grant" drop constraint "tenant_role_grant_roleId_foreign";`,
    );

    this.addSql(`drop table if exists "tenant_role" cascade;`);
    this.addSql(`drop table if exists "tenant_role_grant" cascade;`);
    this.addSql(`drop table if exists "tenant_role_audit" cascade;`);
  }
}
