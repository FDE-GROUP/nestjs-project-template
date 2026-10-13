import { RequirePermissions } from '@app/tenancy/rbac/require-permissions.decorator';
import { TenantPermissionGuard } from '@app/tenancy/rbac/tenant-permission.guard';
import { TenantScopeGuard } from '@app/tenancy/tenant-scope.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateSubscriptionCommand } from '../application/commands/create-subscription.command';
import { GetSubscriptionQuery } from '../application/queries/get-current-subscription.query';
import type { TenantSubscriptionView } from '../application/read-models/subscription.read-model';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

/**
 * Tenant subscription slice (global-tenancy S7 · FR-7/FR-8/D5).
 *
 * Per-route guards only — the global APP_GUARD stays a signed decision (高危#4):
 * - `GET /subscriptions/current`: `TenantScopeGuard` (fail-closed · any authenticated
 *   member of the active tenant reads their own plan/usage/mapping).
 * - `POST /subscriptions`: additionally `TenantPermissionGuard` + `organization:update`
 *   (owner/admin change the plan). The route never names a tenant id — the repository
 *   stamps the ALS tenant (FR-5 single choke-point).
 *
 * Provision actually calls `PaymentService.createCustomer` to establish the tenant ↔
 * customer mapping (FR-8). Quota超限拒绝 (FR-7) is enforced via `QuotaService`/`QuotaGuard`;
 * the production member-add attach point (Better Auth route) is deferred to a later slice.
 */
@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get('current')
  @UseGuards(TenantScopeGuard)
  @ApiOperation({
    summary: 'Current tenant subscription: plan, seat quota, usage, customer mapping',
  })
  @ApiResponse({
    status: 200,
    description: 'Effective subscription snapshot for the active tenant.',
  })
  @ApiResponse({ status: 403, description: 'No active tenant context.' })
  getCurrent(): Promise<TenantSubscriptionView> {
    return this.queryBus.execute<GetSubscriptionQuery, TenantSubscriptionView>(
      new GetSubscriptionQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(TenantScopeGuard, TenantPermissionGuard)
  @RequirePermissions('organization:update')
  @ApiOperation({
    summary: 'Provision/upgrade the tenant subscription (creates the provider customer)',
  })
  @ApiResponse({ status: 201, description: 'Subscription created; returns the updated snapshot.' })
  @ApiResponse({ status: 403, description: 'Not allowed to update the organization.' })
  @ApiResponse({ status: 503, description: 'No payment provider configured.' })
  create(@Body() dto: CreateSubscriptionDto): Promise<TenantSubscriptionView> {
    return this.commandBus.execute<CreateSubscriptionCommand, TenantSubscriptionView>(
      new CreateSubscriptionCommand(
        dto.plan,
        dto.customerEmail,
        dto.seatsLimit,
        dto.storageQuota,
        dto.apiQuota,
      ),
    );
  }
}
