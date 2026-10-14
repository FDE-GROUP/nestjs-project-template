import { CurrentUser } from '@app/modules/auth/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/guards/session.guard';
import type {
  PlatformTenantPage,
  PlatformTenantRow,
  TenantDiagnostics,
} from '@app/modules/tenants/application/read-models/platform-tenant.read-model';
import type { TenantDataExport } from '@app/modules/tenants/application/read-models/tenant-data-export.read-model';
import { PlatformOperatorGuard } from '@core/tenancy/platform/platform-operator.guard';
import { TenantExempt } from '@core/tenancy/tenant-exempt.decorator';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DeleteTenantCommand } from '../application/commands/delete-tenant.command';
import {
  DeleteTenantPermanentlyCommand,
  type TenantHardDeleteResult,
} from '../application/commands/delete-tenant-permanently.command';
import { ResumeTenantCommand } from '../application/commands/resume-tenant.command';
import { SuspendTenantCommand } from '../application/commands/suspend-tenant.command';
import { ExportTenantDataQuery } from '../application/queries/export-tenant-data.query';
import { GetPlatformTenantQuery } from '../application/queries/get-platform-tenant.query';
import { GetTenantDiagnosticsQuery } from '../application/queries/get-tenant-diagnostics.query';
import { ListPlatformTenantsQuery } from '../application/queries/list-platform-tenants.query';
import type { TenantApplicationReadModel } from '../application/read-models/tenant-application.read-model';
import { ListPlatformTenantsDto } from './dto/list-platform-tenants.dto';

/**
 * Platform operator governance slice (global-tenancy S5 · FR-6/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-tenant authority —
 * the unique platform operator, DB email matches `platform.operatorEmail`, fail-closed).
 * These handlers read/write WITHOUT a tenant scope on purpose: platform-level governance
 * spans all tenants (FR-11①), so they deliberately never bind TenantScopeGuard.
 *
 * Lifecycle transitions route through `TenantStatusService.transition` (single metadata
 * choke-point, §9.4 state machine): suspend (active→suspended), resume (suspended→active),
 * delete (soft→deleted terminal). Each success/failure emits a structured audit line (FR-6).
 */
@ApiTags('platform')
// S11 复合全局：跨租平台治理（列表/详情/诊断/suspend·resume·delete）无关单一租户上下文 → 类级豁免租户墙。
@TenantExempt()
@Controller('platform/tenants')
@UseGuards(PlatformOperatorGuard)
export class PlatformTenantsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all tenants across the platform (operator only)' })
  @ApiResponse({ status: 200, description: 'A page of tenants with lifecycle status.' })
  @ApiResponse({ status: 403, description: 'Not the platform operator.' })
  list(@Query() dto: ListPlatformTenantsDto): Promise<PlatformTenantPage> {
    return this.queryBus.execute<ListPlatformTenantsQuery, PlatformTenantPage>(
      new ListPlatformTenantsQuery(dto.limit, dto.offset, dto.search),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one tenant (operator only)' })
  @ApiResponse({ status: 200, description: 'Tenant row.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  async detail(@Param('id') id: string): Promise<PlatformTenantRow> {
    const row = await this.queryBus.execute<GetPlatformTenantQuery, PlatformTenantRow | null>(
      new GetPlatformTenantQuery(id),
    );
    if (!row) throw new NotFoundException('Tenant not found');
    return row;
  }

  @Get(':id/diagnostics')
  @ApiOperation({ summary: 'Per-tenant diagnostics: member/invitation/workspace/post counts' })
  @ApiResponse({ status: 200, description: 'Diagnostics bundle.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  async diagnostics(@Param('id') id: string): Promise<TenantDiagnostics> {
    const diag = await this.queryBus.execute<GetTenantDiagnosticsQuery, TenantDiagnostics | null>(
      new GetTenantDiagnosticsQuery(id),
    );
    if (!diag) throw new NotFoundException('Tenant not found');
    return diag;
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export all tenant-owned data as a single JSON payload (NFR-6)' })
  @ApiResponse({
    status: 200,
    description: 'Six-section tenant data export (credentials excluded).',
  })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  async exportData(@Param('id') id: string): Promise<TenantDataExport> {
    const payload = await this.queryBus.execute<ExportTenantDataQuery, TenantDataExport | null>(
      new ExportTenantDataQuery(id),
    );
    if (!payload) throw new NotFoundException('Tenant not found');
    return payload;
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend an active tenant (active → suspended · fail-closed失能)' })
  @ApiResponse({ status: 200, description: 'Tenant suspended.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  @ApiResponse({ status: 409, description: 'Illegal transition for the current status.' })
  async suspend(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      SuspendTenantCommand,
      TenantApplicationReadModel | null
    >(new SuspendTenantCommand(id, user.id));
    if (!result) throw new NotFoundException('Tenant not found');
    return result;
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume a suspended tenant (suspended → active)' })
  @ApiResponse({ status: 200, description: 'Tenant resumed.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  @ApiResponse({ status: 409, description: 'Illegal transition for the current status.' })
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      ResumeTenantCommand,
      TenantApplicationReadModel | null
    >(new ResumeTenantCommand(id, user.id));
    if (!result) throw new NotFoundException('Tenant not found');
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a tenant (→ deleted terminal · row kept for export)' })
  @ApiResponse({ status: 200, description: 'Tenant marked deleted.' })
  @ApiResponse({ status: 404, description: 'Tenant not found.' })
  @ApiResponse({ status: 409, description: 'Already deleted (illegal transition).' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantApplicationReadModel> {
    const result = await this.commandBus.execute<
      DeleteTenantCommand,
      TenantApplicationReadModel | null
    >(new DeleteTenantCommand(id, user.id));
    if (!result) throw new NotFoundException('Tenant not found');
    return result;
  }

  @Delete(':id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hard-delete a deleted-terminal tenant (irreversible · FK cascade + event purge · NFR-6)',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant rows purged; payload carries purgedEvents for audit核对.',
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant not found (or already hard-deleted · idempotent).',
  })
  @ApiResponse({ status: 409, description: 'Not in deleted terminal state — soft-delete first.' })
  async permanentRemove(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<TenantHardDeleteResult> {
    const result = await this.commandBus.execute<
      DeleteTenantPermanentlyCommand,
      TenantHardDeleteResult | null
    >(new DeleteTenantPermanentlyCommand(id, user.id));
    if (!result) throw new NotFoundException('Tenant not found');
    return result;
  }
}
