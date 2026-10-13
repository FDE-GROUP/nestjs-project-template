import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PostsController } from './api/posts.controller';
import { CreatePostCommandHandler } from './application/commands/handlers/create-post.command-handler';
import { ListPostsQueryHandler } from './application/queries/handlers/list-posts.query-handler';
import { POST_REPOSITORY } from './domain/repositories/post.repository';
import { DrizzlePostRepository } from './infrastructure/repositories/drizzle-post.repository';

const CommandHandlers = [CreatePostCommandHandler];
const QueryHandlers = [ListPostsQueryHandler];

@Module({
  imports: [CqrsModule],
  controllers: [PostsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    // Dependency inversion: domain owns the port, infrastructure enforces tenant scope.
    { provide: POST_REPOSITORY, useClass: DrizzlePostRepository },
  ],
  exports: [],
})
export class PostsModule {}
