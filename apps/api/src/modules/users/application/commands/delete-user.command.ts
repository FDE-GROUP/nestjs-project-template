import { BaseCommand } from '@core/saas-kit/shared-kernel/cqrs/types';

/**
 * PIPL right-to-erase (C1 · FR-7): hard-delete the natural-person user row.
 * `account` / `session` cascade; `consent` FK goes to null and is retained as
 * an anonymous audit trail (see schema.consent).
 *
 * Result is `void` — controller returns 204 on success.
 */
export class DeleteUserCommand extends BaseCommand<void> {
  constructor(readonly userId: string) {
    super();
  }
}
