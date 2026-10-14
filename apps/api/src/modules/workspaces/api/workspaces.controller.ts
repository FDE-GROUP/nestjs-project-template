import { CreateWorkspaceCommand } from '@core/modules/workspaces/application/commands/create-workspace.command';
import { DeleteWorkspaceCommand } from '@core/modules/workspaces/application/commands/delete-workspace.command';
import { UpdateWorkspaceCommand } from '@core/modules/workspaces/application/commands/update-workspace.command';
import { ListWorkspacesQuery } from '@core/modules/workspaces/application/queries/list-workspaces.query';
import type { WorkspaceReadModel } from '@core/modules/workspaces/application/read-models/workspace.read-model';
import type { Page } from '@core/shared-kernel/domain/pagination';
import { RequirePermissions } from '@core/tenancy/rbac/require-permissions.decorator';
import { TenantPermissionGuard } from '@core/tenancy/rbac/tenant-permission.guard';
import { TenantScopeGuard } from '@core/tenancy/tenant-scope.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ListPageDto } from '../../../common/dto/list-page.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';

/**
 * Workspace CRUD reference slice (global-tenancy S3 · D2/§9.1 / FR-4/FR-5).
 *
 * Both guards run per-route (NOT global — APP_GUARD stays a signed decision, 高危#4):
 * - `TenantScopeGuard`: fail-closed — no active tenant → 403.
 * - `TenantPermissionGuard`: delegates the capability check to Better Auth `ac` (single
 *   source of truth), so role→permission mapping is never scattered here.
 *
 * Permission tiers (S3 human call): `workspace:read` for all members;
 * `workspace:create/update/delete` for owner+admin. Row scoping by tenant is enforced in
 * the repository — handlers/controllers never name a tenant id.
 */
@ApiTags('workspaces')
@Controller('workspaces')
@UseGuards(TenantScopeGuard, TenantPermissionGuard)
export class WorkspacesController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermissions('workspace:read')
  @ApiOperation({ summary: 'List workspaces in the active tenant' })
  @ApiResponse({ status: 200, description: 'Workspaces owned by the active tenant.' })
  @ApiResponse({ status: 403, description: 'No active tenant, or missing workspace:read.' })
  list(@Query() request: ListPageDto): Promise<Page<WorkspaceReadModel>> {
    return this.queryBus.execute<ListWorkspacesQuery, Page<WorkspaceReadModel>>(
      new ListWorkspacesQuery(request),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('workspace:create')
  @ApiOperation({ summary: 'Create a workspace (owner/admin)' })
  @ApiResponse({ status: 201, description: 'Created workspace stamped with the active tenant.' })
  @ApiResponse({ status: 403, description: 'Missing workspace:create (members are rejected).' })
  create(@Body() dto: CreateWorkspaceDto): Promise<WorkspaceReadModel> {
    return this.commandBus.execute<CreateWorkspaceCommand, WorkspaceReadModel>(
      new CreateWorkspaceCommand(dto.name, dto.slug),
    );
  }

  @Patch(':id')
  @RequirePermissions('workspace:update')
  @ApiOperation({ summary: 'Update a workspace (owner/admin)' })
  @ApiResponse({ status: 200, description: 'Updated workspace.' })
  @ApiResponse({ status: 404, description: 'Workspace not found in the active tenant.' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ): Promise<WorkspaceReadModel> {
    const result = await this.commandBus.execute<UpdateWorkspaceCommand, WorkspaceReadModel | null>(
      new UpdateWorkspaceCommand(id, dto.name, dto.slug),
    );
    if (!result) throw new NotFoundException('Workspace not found');
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('workspace:delete')
  @ApiOperation({ summary: 'Delete a workspace (owner/admin)' })
  @ApiResponse({ status: 204, description: 'Workspace deleted.' })
  @ApiResponse({ status: 404, description: 'Workspace not found in the active tenant.' })
  async remove(@Param('id') id: string): Promise<void> {
    const deleted = await this.commandBus.execute<DeleteWorkspaceCommand, boolean>(
      new DeleteWorkspaceCommand(id),
    );
    if (!deleted) throw new NotFoundException('Workspace not found');
  }
}
