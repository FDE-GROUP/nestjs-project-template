alter table "account" add constraint "account_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade
alter table "account" drop constraint "account_userId_user_id_fk"
alter table "consent" add constraint "consent_userId_foreign" foreign key ("userId") references "user" ("id") on delete set null
alter table "consent" drop constraint "consent_userId_user_id_fk"
alter table "invitation" add constraint "invitation_inviterId_foreign" foreign key ("inviterId") references "user" ("id") on delete cascade
alter table "invitation" add constraint "invitation_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade
alter table "invitation" drop constraint "invitation_inviterId_user_id_fk"
alter table "invitation" drop constraint "invitation_organizationId_organization_id_fk"
alter table "member" add constraint "member_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade
alter table "member" add constraint "member_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade
alter table "member" drop constraint "member_organizationId_organization_id_fk"
alter table "member" drop constraint "member_userId_user_id_fk"
alter table "post" add constraint "post_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade
alter table "post" add constraint "post_workspaceId_foreign" foreign key ("workspaceId") references "workspace" ("id") on delete set null
alter table "post" drop constraint "post_organizationId_organization_id_fk"
alter table "post" drop constraint "post_workspaceId_workspace_id_fk"
alter table "session" add constraint "session_userId_foreign" foreign key ("userId") references "user" ("id") on delete cascade
alter table "session" drop constraint "session_userId_user_id_fk"
alter table "tenant_subscription" add constraint "tenant_subscription_tenantId_foreign" foreign key ("tenantId") references "organization" ("id") on delete cascade
alter table "tenant_subscription" drop constraint "tenant_subscription_tenantId_organization_id_fk"
alter table "user_status" add constraint "user_status_userId_foreign" foreign key ("userId") references "user" ("id") on update no action on delete cascade
alter table "user_status" drop constraint "user_status_userId_user_id_fk"
alter table "workspace" add constraint "workspace_organizationId_foreign" foreign key ("organizationId") references "organization" ("id") on delete cascade
alter table "workspace" drop constraint "workspace_organizationId_organization_id_fk"
