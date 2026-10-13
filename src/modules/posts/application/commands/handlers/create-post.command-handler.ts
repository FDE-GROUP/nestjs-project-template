import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { POST_REPOSITORY, type PostRepository } from '../../../domain/repositories/post.repository';
import type { PostReadModel } from '../../read-models/post.read-model';
import { CreatePostCommand } from '../create-post.command';

@CommandHandler(CreatePostCommand)
export class CreatePostCommandHandler implements ICommandHandler<CreatePostCommand, PostReadModel> {
  constructor(@Inject(POST_REPOSITORY) private readonly posts: PostRepository) {}

  async execute(command: CreatePostCommand): Promise<PostReadModel> {
    return this.posts.create({
      title: command.title,
      content: command.content ?? null,
      published: command.published,
    });
  }
}
