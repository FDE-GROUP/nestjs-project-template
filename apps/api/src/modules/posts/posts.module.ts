import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PostsController } from './api/posts.controller';
import { CreatePostCommandHandler } from './application/commands/handlers/create-post.command-handler';
import { ListPostsQueryHandler } from './application/queries/handlers/list-posts.query-handler';
import { POST_REPOSITORY } from './domain/repositories/post.repository';
// ORM 修宪案 B · 切片 2：posts 数据面切至 MikroORM 适配（MikroORM 为唯一实现）。
import { MikroPostRepository } from './infrastructure/repositories/mikro-post.repository';

const CommandHandlers = [CreatePostCommandHandler];
const QueryHandlers = [ListPostsQueryHandler];

@Module({
  imports: [CqrsModule],
  controllers: [PostsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the port, infrastructure enforces tenant scope.
    { provide: POST_REPOSITORY, useClass: MikroPostRepository },
  ],
  exports: [],
})
export class PostsModule {}
