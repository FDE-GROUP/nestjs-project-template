import { CurrentUser } from '@app/modules/auth/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/guards/session.guard';
import { SessionGuard } from '@app/modules/auth/guards/session.guard';
import { PlatformOperatorGuard } from '@app/tenancy/platform/platform-operator.guard';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApproveTenantCommand } from '../application/commands/approve-tenant.command';
import { RejectTenantCommand } from '../application/commands/reject-tenant.command';
import { SubmitTenantApplicationCommand } from '../application/commands/submit-tenant-application.command';
import type { TenantApplicationReadModel } from '../application/read-models/tenant-application.read-model';
import { CreateTenantApplicationDto } from './dto/create-tenant-application.dto';

/**
 * Tenant application / approval reference slice (global-tenancy S4 · FR-1/FR-11/FR-12).
 *
 * FR-11 three-layer separation is expressed by the guard chosen PER ROUTE — none of these
 * is tenant-scoped (you have no active tenant while applying; approval is cross-tenant):
 * - `POST /tenants/applications`         → user-level (SessionGuard): authenticated user applies.
 * - `POST /tenants/applications/:id/approve|reject` → platform-level (PlatformOperatorGuard).
 *
 * Applying creates a `pending_approval` organization (self-service instant provisioning is
 * closed at the BA layer — `allowUserToCreateOrganization:false`); the applicant becomes the
 * first `owner` via BA (FR-12). A pending tenant binds no tenant context, so its business
 * routes fail closed until an operator approves it (S4 middleware deny-list).
 */
@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(@Inject(CommandBus) private readonly commandBus: CommandBus) {}

  @Post('applications')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply to create a tenant (user-level · lands pending_approval)' })
  @ApiResponse({ status: 201, description: 'Pending tenant created; inactive until approved.' })
  @ApiResponse({ status: 401, description: 'Missing or invalid session.' })
  apply(
    @CurrentUser() user: SessionUser,
    @Body() dto: CreateTenantApplicationDto,
  ): Promise<TenantApplicationReadModel> {
    return this.commandBus.execute<SubmitTenantApplicationCommand, TenantApplicationReadModel>(
      new SubmitTenantApplicationCommand(user.id, dto.name, dto.slug),
    );
  }

  @Post('applications/:id/approve')
  @UseGuards(PlatformOperatorGuard)
  @ApiOperation({ summary: 'Approve a pending tenant (platform operator · pending → active)' })
  @ApiResponse({ status: 200, description: 'Tenant activated.' })
  @ApiResponse({ status: 403, description: 'Not a platform operator.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  async approve(@Param('id') id: string): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      ApproveTenantCommand,
      TenantApplicationReadModel | null
    >(new ApproveTenantCommand(id));
    if (!result) throw new NotFoundException('Tenant application not found');
    return result;
  }

  @Post('applications/:id/reject')
  @UseGuards(PlatformOperatorGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reject a pending tenant (platform operator · hard-delete)' })
  @ApiResponse({ status: 204, description: 'Pending tenant discarded.' })
  @ApiResponse({ status: 403, description: 'Not a platform operator.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  async reject(@Param('id') id: string): Promise<void> {
    const removed = await this.commandBus.execute<RejectTenantCommand, boolean>(
      new RejectTenantCommand(id),
    );
    if (!removed) throw new NotFoundException('Tenant application not found');
  }
}
