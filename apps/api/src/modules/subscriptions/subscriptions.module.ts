import { CreateSubscriptionCommandHandler } from '@core/saas-kit/modules/subscriptions/application/commands/handlers/create-subscription.command-handler';
import { GetSubscriptionQueryHandler } from '@core/saas-kit/modules/subscriptions/application/queries/handlers/get-current-subscription.query-handler';
import { CUSTOMER_PROVISIONER } from '@core/saas-kit/modules/subscriptions/domain/ports/customer-provisioner.port';
import { SUBSCRIPTION_REPOSITORY } from '@core/saas-kit/modules/subscriptions/domain/repositories/subscription.repository';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SubscriptionsController } from './api/subscriptions.controller';
import { PaymentCustomerProvisioner } from './infrastructure/payment-customer.provisioner';
import { MikroSubscriptionRepository } from './infrastructure/repositories/mikro-subscription.repository';

const CommandHandlers = [CreateSubscriptionCommandHandler];
const QueryHandlers = [GetSubscriptionQueryHandler];

/**
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Dependencies resolve without extra imports: `原数据库服务` (DatabaseModule @Global),
 * `QuotaService` / `TenantContextService` (TenancyModule @Global) and `PaymentService`
 * (PaymentModule now @Global). Dependency inversion: the domain owns the subscription
 * repository port; the ORM adapter stamps/scope the ALS tenant (FR-5 choke-point).
 */
@Module({
  imports: [CqrsModule],
  controllers: [SubscriptionsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // ORM 修宪案 B · 切片 3c-ii-A：订阅仓储绑定改指 Mikro 适配（MikroORM 为唯一实现）。
    { provide: SUBSCRIPTION_REPOSITORY, useClass: MikroSubscriptionRepository },
    // §9.5.4①B/④ · P1c：订阅 domain/application 经端口消费客户开通，PaymentService 适配留应用侧。
    { provide: CUSTOMER_PROVISIONER, useClass: PaymentCustomerProvisioner },
  ],
  exports: [],
})
export class SubscriptionsModule {}
