import { describe, expect, it } from 'vitest';
import {
  account,
  consent,
  event,
  invitation,
  member,
  organization,
  post,
  Role,
  roleEnum,
  schema,
  session,
  tenantSubscription,
  user,
  userStatus,
  verification,
  workspace,
} from './schema';

describe('database schema', () => {
  it('exports every table under the schema aggregate', () => {
    expect(Object.keys(schema).sort()).toEqual(
      [
        'account',
        'consent',
        'event',
        'invitation',
        'member',
        'organization',
        'post',
        'session',
        'tenantSubscription',
        'user',
        'userStatus',
        'verification',
        'workspace',
      ].sort(),
    );
  });

  it('event table exposes the ES envelope columns (ES 首切片 · shadow append)', () => {
    // 列与 DomainEvent 信封一一对应（含 eventId 保真列·plan §6 审计改动）；
    // 增删列属契约变更，须过审计门同步 roadmap/适配器。
    expect(event.id).toBeDefined();
    expect(event.eventId).toBeDefined();
    expect(event.aggregateId).toBeDefined();
    expect(event.aggregateType).toBeDefined();
    expect(event.version).toBeDefined();
    expect(event.eventType).toBeDefined();
    expect(event.eventVersion).toBeDefined();
    expect(event.payload).toBeDefined();
    expect(event.metadata).toBeDefined();
    expect(event.occurredAt).toBeDefined();
    expect(event.createdAt).toBeDefined();
  });

  it('user table exposes the expected columns', () => {
    expect(user.id).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.emailVerified).toBeDefined();
    expect(user.role).toBeDefined();
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  it('better-auth auxiliary tables expose their required columns', () => {
    expect(account.userId).toBeDefined();
    expect(account.providerId).toBeDefined();
    expect(session.token).toBeDefined();
    expect(session.userId).toBeDefined();
    expect(verification.identifier).toBeDefined();
    expect(verification.value).toBeDefined();
  });

  it('role enum values match the exported Role constants', () => {
    expect(roleEnum.enumValues).toEqual(['USER', 'ADMIN']);
    expect(Role.USER).toBe('USER');
    expect(Role.ADMIN).toBe('ADMIN');
  });

  it('post exposes its core columns', () => {
    expect(post.id).toBeDefined();
    expect(post.title).toBeDefined();
    expect(post.published).toBeDefined();
    expect(post.createdAt).toBeDefined();
  });

  it('post carries the tenant column for data isolation (S2 · FR-5)', () => {
    // tenant-owned business row must expose organizationId (== tenant id) for scoped queries.
    expect(post.organizationId).toBeDefined();
  });

  it('post carries the workspace column for the second-level boundary (S3 · D2/§8-6)', () => {
    expect(post.workspaceId).toBeDefined();
  });

  it('workspace table exposes its compound-scope columns (S3 · D2/§8-6)', () => {
    expect(workspace.id).toBeDefined();
    expect(workspace.organizationId).toBeDefined();
    expect(workspace.name).toBeDefined();
    expect(workspace.slug).toBeDefined();
    expect(workspace.createdAt).toBeDefined();
    expect(workspace.updatedAt).toBeDefined();
  });

  it('consent (PIPL ledger · C1) exposes purpose/version/grantedAt/revokedAt', () => {
    expect(consent.id).toBeDefined();
    expect(consent.userId).toBeDefined();
    expect(consent.purpose).toBeDefined();
    expect(consent.version).toBeDefined();
    expect(consent.grantedAt).toBeDefined();
    expect(consent.revokedAt).toBeDefined();
  });

  it('organization plugin tables expose their required columns (混合复用 · S0)', () => {
    expect(organization.slug).toBeDefined();
    expect(organization.metadata).toBeDefined();
    expect(member.organizationId).toBeDefined();
    expect(member.userId).toBeDefined();
    expect(member.role).toBeDefined();
    expect(invitation.status).toBeDefined();
    expect(invitation.expiresAt).toBeDefined();
    expect(session.activeOrganizationId).toBeDefined();
  });

  it('user_status (S6 · FR-10 suspension ledger) exposes userId/status/reason', () => {
    expect(userStatus.userId).toBeDefined();
    expect(userStatus.status).toBeDefined();
    expect(userStatus.reason).toBeDefined();
    expect(userStatus.createdAt).toBeDefined();
    expect(userStatus.updatedAt).toBeDefined();
  });

  it('tenant_subscription (S7 · FR-7/8/D5) exposes quota + FR-8 mapping columns', () => {
    expect(tenantSubscription.id).toBeDefined();
    expect(tenantSubscription.tenantId).toBeDefined();
    expect(tenantSubscription.plan).toBeDefined();
    expect(tenantSubscription.status).toBeDefined();
    expect(tenantSubscription.seatsLimit).toBeDefined();
    expect(tenantSubscription.periodStart).toBeDefined();
    expect(tenantSubscription.periodEnd).toBeDefined();
    expect(tenantSubscription.provider).toBeDefined();
    expect(tenantSubscription.providerCustomerId).toBeDefined();
    expect(tenantSubscription.providerSubscriptionId).toBeDefined();
  });
});
