import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SubscriptionsController } from './api/subscriptions.controller';
import { CreateSubscriptionCommandHandler } from './application/commands/handlers/create-subscription.command-handler';
import { GetSubscriptionQueryHandler } from './application/queries/handlers/get-current-subscription.query-handler';
import { SUBSCRIPTION_REPOSITORY } from './domain/repositories/subscription.repository';
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
  ],
  exports: [],
})
export class SubscriptionsModule {}
