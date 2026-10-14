import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { DrizzleService } from '@app/database/drizzle.service';
import {
  event,
  invitation,
  member,
  organization,
  post,
  tenantSubscription,
  user,
  workspace,
} from '@app/database/schema';
import { TENANT_STATUS } from '@core/saas-kit/tenancy/lifecycle/tenant-lifecycle';
import { CommandBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { DeleteTenantCommand } from '../modules/tenants/application/commands/delete-tenant.command';
import { DeleteTenantPermanentlyCommand } from '../modules/tenants/application/commands/delete-tenant-permanently.command';

/**
 * NFR-6 删除半 · env-gated 真库 e2e（module-tenancy-hard-delete §4-3）：
 * 真 DB 上坐实「软删 → 硬删」两段式编排的 **FK cascade 实效**——本测是本切片
 * 唯一触真库的 cascade/补删证据（单测面全部 mock，证不了 DB 级联语义）。
 *
 * 编排走 CommandBus 服务端通道（同软删/审批面范式）：
 *   真软删（DeleteTenantCommand → transition deleted）→ 真硬删（DeleteTenantPermanentlyCommand）
 *   → 断言六表 0 行 + `tenant` 聚合事件 0 行（先补删后主删）+ **user 行幸存**（自然人不连带）。
 * 另坐实前置闸：active 租户硬删 → 409 且不删。
 *
 * **默认跳过**：仅当 `E2E_DATABASE_URL` 存在时运行（开关），连接串取 `DATABASE_URL`，
 * 不破默认 CI 的 DB-free 不变量。夹具用时间戳后缀唯一键，afterAll 显式清净，运行幂等。
 */
const E2E_DB = process.env.E2E_DATABASE_URL;
const gated = E2E_DB ? describe : describe.skip;

gated('按租户硬删全栈 e2e（真库 FK cascade + 事件补删 · env-gated）', () => {
  let db: DrizzleService['db'];
  let commandBus: CommandBus;

  const stamp = Date.now();
  const userId = `e2e-hd-user-${stamp}`;
  const orgId = `e2e-hd-org-${stamp}`;
  const activeOrgId = `e2e-hd-active-${stamp}`;

  async function seedTenantOwned(id: string, withExtras: boolean) {
    await db.insert(organization).values({ id, name: `HD ${id}`, slug: `hd-${id}` });
    if (!withExtras) return;
    await db.insert(member).values({
      id: `e2e-hd-mem-${stamp}`,
      organizationId: id,
      userId,
      role: 'owner',
    });
    await db.insert(invitation).values({
      id: `e2e-hd-inv-${stamp}`,
      organizationId: id,
      email: `invitee-${stamp}@e2e.test`,
      role: 'member',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: userId,
    });
    await db.insert(workspace).values({
      id: `e2e-hd-ws-${stamp}`,
      organizationId: id,
      name: 'Core',
      slug: `core-${stamp}`,
    });
    await db.insert(tenantSubscription).values({
      id: `e2e-hd-sub-${stamp}`,
      tenantId: id,
      plan: 'free',
      seatsLimit: 5,
    });
    await db.insert(post).values({
      id: `e2e-hd-post-${stamp}`,
      title: 'HD e2e',
      organizationId: id,
    });
    // 手写一行 tenant 聚合事件（不依赖 EVENT_STORE_ENABLED 开关·FK-less 表应用层补删面）
    await db.insert(event).values({
      eventId: randomUUID(),
      aggregateId: id,
      aggregateType: 'tenant',
      version: 1,
      eventType: 'tenant.status.transitioned',
      payload: { from: null, to: 'active' },
      occurredAt: new Date(),
    });
  }

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // CqrsModule 在模块生命周期（init）才把 @CommandHandler 注册进 CommandBus；
    // 纯 compile() 不触发（同 boot 冒烟免连库形态），经 CommandBus 驱动的本测必须 init。
    await ref.init();
    db = ref.get(DrizzleService).db;
    commandBus = ref.get(CommandBus);

    await db.insert(user).values({ id: userId, name: 'HD E2E', email: `hd-${stamp}@e2e.test` });
    await seedTenantOwned(orgId, true);
    await seedTenantOwned(activeOrgId, false);
  });

  afterAll(async () => {
    // 清净残余（org 级联灭子表；user/event 独立清）——运行幂等
    await db.delete(organization).where(inArray(organization.id, [orgId, activeOrgId]));
    await db.delete(event).where(inArray(event.aggregateId, [orgId, activeOrgId]));
    await db.delete(user).where(inArray(user.id, [userId]));
  });

  it('软删→硬删：六表 cascade 灭、tenant 事件补删、user 幸存；重复硬删 404 幂等', async () => {
    // ① 真软删（transition → deleted 终态）
    const soft = await commandBus.execute(new DeleteTenantCommand(orgId, userId));
    expect(soft).toMatchObject({ organizationId: orgId, status: TENANT_STATUS.DELETED });

    // ② 真硬删（先补删事件后删主行）
    const result = await commandBus.execute(new DeleteTenantPermanentlyCommand(orgId, userId));
    expect(result).toMatchObject({ organizationId: orgId });
    const purged = (result as { purgedEvents: number }).purgedEvents;
    expect(purged).toBeGreaterThanOrEqual(1); // 至少清掉本测手写的那行

    // ③ 六表 cascade 断言（真库 DB 级联语义·单测 mock 证不了的面）
    const counts = await Promise.all([
      db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId)),
      db.select({ id: member.id }).from(member).where(eq(member.organizationId, orgId)),
      db.select({ id: invitation.id }).from(invitation).where(eq(invitation.organizationId, orgId)),
      db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, orgId)),
      db
        .select({ id: tenantSubscription.id })
        .from(tenantSubscription)
        .where(eq(tenantSubscription.tenantId, orgId)),
      db.select({ id: post.id }).from(post).where(eq(post.organizationId, orgId)),
    ]);
    for (const rows of counts) expect(rows).toHaveLength(0);

    // ④ tenant 聚合事件补删至 0；user 行幸存（自然人不连带）
    const eventsLeft = await db
      .select({ id: event.id })
      .from(event)
      .where(eq(event.aggregateId, orgId));
    expect(eventsLeft).toHaveLength(0);
    const userLeft = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
    expect(userLeft).toHaveLength(1);

    // ⑤ 重复硬删 → null（controller 面 404 幂等语义）
    await expect(
      commandBus.execute(new DeleteTenantPermanentlyCommand(orgId, userId)),
    ).resolves.toBeNull();
  });

  it('前置闸：active 租户硬删 → 409 且行保留（两段式不可越过）', async () => {
    await expect(
      commandBus.execute(new DeleteTenantPermanentlyCommand(activeOrgId, userId)),
    ).rejects.toThrow(/not in deleted terminal state/);
    const rows = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, activeOrgId));
    expect(rows).toHaveLength(1);
  });
});
