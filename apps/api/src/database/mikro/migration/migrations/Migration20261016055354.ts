import { Migration } from '@mikro-orm/migrations';

export class Migration20261016055354 extends Migration {
  override name = 'Migration20261016055354';

  override up(): void | Promise<void> {
    this.addSql(`create type "role" as enum ('USER', 'ADMIN');`);
    this.addSql(
      `create table "event" ("id" bigserial primary key, "eventId" text not null, "aggregateId" text not null, "aggregateType" text not null, "version" int not null, "eventType" text not null, "eventVersion" int not null default 1, "payload" jsonb not null, "metadata" jsonb null, "occurredAt" timestamp not null, "createdAt" timestamp not null default now());`,
    );
    this.addSql(`create index "event_aggregate_idx" on "event" ("aggregateType", "aggregateId");`);
    this.addSql(
      `alter table "event" add constraint "event_aggregate_version_key" unique ("aggregateType", "aggregateId", "version");`,
    );
    this.addSql(`alter table "event" add constraint "event_event_id_key" unique ("eventId");`);

    this.addSql(
      `create table "organization" ("id" text not null, "name" text not null, "slug" text not null, "logo" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp null, "metadata" jsonb null, primary key ("id"));`,
    );

    this.addSql(
      `create table "tenant_subscription" ("id" text not null, "tenantId" text not null, "plan" text not null, "status" text not null default 'active', "seatsLimit" int not null, "storageQuota" int null, "apiQuota" int null, "periodStart" timestamp not null default now(), "periodEnd" timestamp null, "provider" text null, "providerCustomerId" text null, "providerSubscriptionId" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "tenant_subscription_tenant_status_idx" on "tenant_subscription" ("tenantId", "status");`,
    );
    this.addSql(
      `create index "tenant_subscription_tenant_period_idx" on "tenant_subscription" ("tenantId", "periodStart");`,
    );

    this.addSql(
      `create table "user" ("id" text not null, "name" text not null, "email" text not null, "emailVerified" boolean not null default false, "image" text null, "isOwner" boolean not null default false, "handle" text not null default '', "password" text null, "firstName" text null, "lastName" text null, "role" "role" not null default 'USER', "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(`alter table "user" add constraint "user_email_idx" unique ("email");`);

    this.addSql(
      `create table "session" ("id" text not null, "expiresAt" timestamp not null, "token" text not null, "userId" text not null, "provider" text null, "activeOrganizationId" text null, "ipAddress" text null, "userAgent" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "member" ("id" text not null, "organizationId" text not null, "userId" text not null, "role" text not null default 'member', "createdAt" timestamp not null default now(), primary key ("id"));`,
    );
    this.addSql(
      `alter table "member" add constraint "member_org_user_idx" unique ("organizationId", "userId");`,
    );

    this.addSql(
      `create table "invitation" ("id" text not null, "organizationId" text not null, "email" text not null, "role" text not null, "status" text not null default 'pending', "expiresAt" timestamp not null, "inviterId" text not null, "createdAt" timestamp not null default now(), primary key ("id"));`,
    );
    this.addSql(
      `create index "invitation_org_email_idx" on "invitation" ("organizationId", "email");`,
    );

    this.addSql(
      `create table "consent" ("id" text not null, "userId" text null, "purpose" text not null, "version" text not null, "grantedAt" timestamp not null default now(), "revokedAt" timestamp null, "evidence" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(`create index "consent_user_purpose_idx" on "consent" ("userId", "purpose");`);

    this.addSql(
      `create table "account" ("id" text not null, "accountId" text not null, "providerId" text not null, "userId" text not null, "accessToken" text null, "refreshToken" text null, "idToken" text null, "accessTokenExpiresAt" timestamp null, "refreshTokenExpiresAt" timestamp null, "scope" text null, "password" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "user_status" ("userId" text not null, "status" text not null, "reason" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("userId"));`,
    );

    this.addSql(
      `create table "verification" ("id" text not null, "identifier" text not null, "value" text not null, "expiresAt" timestamp not null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "workspace" ("id" text not null, "organizationId" text not null, "name" text not null, "slug" text not null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "workspace" add constraint "workspace_org_slug_idx" unique ("organizationId", "slug");`,
    );

    this.addSql(
      `create table "post" ("id" text not null, "title" text not null, "content" text null, "published" boolean not null default false, "organizationId" text not null, "workspaceId" text null, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "post_organization_created_idx" on "post" ("organizationId", "createdAt");`,
    );
    this.addSql(
      `create index "post_organization_workspace_idx" on "post" ("organizationId", "workspaceId");`,
    );

    this.addSql(
      `alter table "tenant_subscription" add constraint "tenant_subscription_tenantId_foreign" foreign key ("tenantId") references "organization" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "session" add constraint "session_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "member" add constraint "member_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "member" add constraint "member_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "invitation" add constraint "invitation_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "invitation" add constraint "invitation_inviterId_foreign" foreign key ("inviterId") references "user" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "consent" add constraint "consent_userId_foreign" foreign key ("userId") references "user" ("id") on delete set null;`,
    );

    this.addSql(
      `alter table "account" add constraint "account_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "user_status" add constraint "user_status_userId_foreign" foreign key ("userId") references "user" ("id") on update no action on delete cascade;`,
    );

    this.addSql(
      `alter table "workspace" add constraint "workspace_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );

    this.addSql(
      `alter table "post" add constraint "post_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade;`,
    );
    this.addSql(
      `alter table "post" add constraint "post_workspaceId_foreign" foreign key ("workspaceId") references "workspace" ("id") on delete set null;`,
    );
  }
}
