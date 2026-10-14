import { CurrentUser } from '@app/modules/auth/decorators/current-user.decorator';
import type { SessionUser } from '@app/modules/auth/guards/session.guard';
import type {
  PlatformUserPage,
  UserGovernanceResult,
} from '@app/modules/tenants/application/read-models/platform-user.read-model';
import { PlatformOperatorGuard } from '@core/saas-kit/tenancy/platform/platform-operator.guard';
import { TenantExempt } from '@core/saas-kit/tenancy/tenant-exempt.decorator';
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ResumeUserCommand } from '../application/commands/resume-user.command';
import { SuspendUserCommand } from '../application/commands/suspend-user.command';
import { ListPlatformUsersQuery } from '../application/queries/list-platform-users.query';
import { ListPlatformUsersDto } from './dto/list-platform-users.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';

/**
 * Platform operator user-governance slice (global-tenancy S6 · FR-6/FR-10/FR-11①/FR-13).
 *
 * Every route is gated by `PlatformOperatorGuard` (the sole cross-platform authority, fail-closed).
 * These handlers act WITHOUT a tenant scope on purpose: suspending a platform user revokes their
 * access across every tenant and the platform layer (FR-10/FR-11), so they never bind TenantScopeGuard.
 *
 * suspend (active→suspended) additionally hard-invalidates the user's sessions (D4 · §159);
 * resume (suspended→active) lifts the deny-list. Each success/failure emits a structured audit line (FR-6).
 */
@ApiTags('platform')
// S11 复合全局：跨租平台治理（operator 行动时无关租户上下文）→ 类级豁免租户墙（仍由 PlatformOperatorGuard 逐路由卡）。
@TenantExempt()
@Controller('platform/users')
@UseGuards(PlatformOperatorGuard)
export class PlatformUsersController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all platform users with lifecycle status (operator only)' })
  @ApiResponse({ status: 200, description: 'A page of users with suspension status.' })
  @ApiResponse({ status: 403, description: 'Not the platform operator.' })
  list(@Query() dto: ListPlatformUsersDto): Promise<PlatformUserPage> {
    return this.queryBus.execute<ListPlatformUsersQuery, PlatformUserPage>(
      new ListPlatformUsersQuery(dto.limit, dto.offset, dto.search),
    );
  }

  @Patch(':id/suspend')
  @ApiOperation({
    summary:
      'Suspend a platform user (active → suspended · sessions invalidated · fail-closed失能)',
  })
  @ApiResponse({ status: 200, description: 'User suspended.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'Illegal transition for the current status.' })
  async suspend(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: SuspendUserDto,
  ): Promise<UserGovernanceResult> {
    const result = await this.commandBus.execute<SuspendUserCommand, UserGovernanceResult | null>(
      new SuspendUserCommand(id, user.id, dto?.reason),
    );
    if (!result) throw new NotFoundException('User not found');
    return result;
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume a suspended platform user (suspended → active)' })
  @ApiResponse({ status: 200, description: 'User resumed.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  @ApiResponse({ status: 409, description: 'Illegal transition for the current status.' })
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<UserGovernanceResult> {
    const result = await this.commandBus.execute<ResumeUserCommand, UserGovernanceResult | null>(
      new ResumeUserCommand(id, user.id),
    );
    if (!result) throw new NotFoundException('User not found');
    return result;
  }
}
