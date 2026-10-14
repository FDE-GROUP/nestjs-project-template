import { BaseCommand } from '@core/shared-kernel/cqrs/types';
import type { PublicUser } from '../../domain/entities/user.aggregate';

/**
 * Write-side intent to register a user. Carries primitives (never a DTO),
 * so the transport layer stays decoupled from the application layer.
 */
export class CreateUserCommand extends BaseCommand<PublicUser> {
  constructor(
    readonly email: string,
    readonly password: string,
    readonly firstName?: string | null,
    readonly lastName?: string | null,
  ) {
    super();
  }
}
