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
import { CreatePostCommand } from '../application/commands/create-post.command';
import { ListPostsQuery } from '../application/queries/list-posts.query';
import type { PostReadModel } from '../application/read-models/post.read-model';
import { CreatePostDto } from './dto/create-post.dto';

/**
 * Reference tenant-scoped resource (global-tenancy S2 · FR-5). Both routes are gated by
 * `TenantScopeGuard` (fail-closed: no active tenant → 403) and read/write exclusively
 * through the tenant-scoped repository — the handler never names a tenant id. This is the
 * template future business features copy, so the isolation boundary is idiomatic, not bolted on.
 */
@ApiTags('posts')
@Controller('posts')
@UseGuards(TenantScopeGuard)
export class PostsController {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,
    @Inject(QueryBus) private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List posts in the active tenant' })
  @ApiResponse({ status: 200, description: 'Posts owned by the active tenant.' })
  @ApiResponse({ status: 403, description: 'No active tenant context.' })
  list(): Promise<PostReadModel[]> {
    return this.queryBus.execute<ListPostsQuery, PostReadModel[]>(new ListPostsQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a post in the active tenant' })
  @ApiResponse({ status: 201, description: 'Created post stamped with the active tenant.' })
  @ApiResponse({ status: 403, description: 'No active tenant context.' })
  create(@Body() dto: CreatePostDto): Promise<PostReadModel> {
    return this.commandBus.execute<CreatePostCommand, PostReadModel>(
      new CreatePostCommand(dto.title, dto.content ?? null, dto.published),
    );
  }
}
