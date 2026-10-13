import { CreateSubscriptionCommandHandler } from '@core/modules/subscriptions/application/commands/handlers/create-subscription.command-handler';
import { GetSubscriptionQueryHandler } from '@core/modules/subscriptions/application/queries/handlers/get-current-subscription.query-handler';
import { CUSTOMER_PROVISIONER } from '@core/modules/subscriptions/domain/ports/customer-provisioner.port';
import { SUBSCRIPTION_REPOSITORY } from '@core/modules/subscriptions/domain/repositories/subscription.repository';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SubscriptionsController } from './api/subscriptions.controller';
import { PaymentCustomerProvisioner } from './infrastructure/payment-customer.provisioner';
import { DrizzleSubscriptionRepository } from './infrastructure/repositories/drizzle-subscription.repository';

const CommandHandlers = [CreateSubscriptionCommandHandler];
const QueryHandlers = [GetSubscriptionQueryHandler];

/**
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Dependencies resolve without extra imports: `DrizzleService` (DatabaseModule @Global),
 * `QuotaService` / `TenantContextService` (TenancyModule @Global) and `PaymentService`
 * (PaymentModule now @Global). Dependency inversion: the domain owns the subscription
 * repository port; the Drizzle adapter stamps/scope the ALS tenant (FR-5 choke-point).
 */
@Module({
  imports: [CqrsModule],
  controllers: [SubscriptionsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    { provide: SUBSCRIPTION_REPOSITORY, useClass: DrizzleSubscriptionRepository },
    // §9.5.4①B/④ · P1c：订阅 domain/application 经端口消费客户开通，PaymentService 适配留应用侧。
    { provide: CUSTOMER_PROVISIONER, useClass: PaymentCustomerProvisioner },
  ],
  exports: [],
})
export class SubscriptionsModule {}
