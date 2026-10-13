import { DrizzleService } from '@app/database/drizzle.service';
import { account, consent, session, user } from '@app/database/schema';
import { Inject, NotFoundException } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import type { UserDataExportReadModel } from '../../read-models/user-data-export.read-model';
import { ExportUserDataQuery } from '../export-user-data.query';

/**
 * Handler for PIPL right-to-access. Selects personal-data columns ONLY —
 * password / tokens / session token / consent evidence are excluded at the
 * projection layer (never rely on downstream masking).
 */
@QueryHandler(ExportUserDataQuery)
export class ExportUserDataQueryHandler
  implements IQueryHandler<ExportUserDataQuery, UserDataExportReadModel>
{
  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  // fallow-ignore-next-line unused-class-member -- contract method invoked by the @nestjs/cqrs QueryBus
  async execute(query: ExportUserDataQuery): Promise<UserDataExportReadModel> {
    const userRow = await this.drizzle.db.query.user.findFirst({
      where: eq(user.id, query.userId),
      columns: {
        id: true,
        email: true,
        name: true,
        handle: true,
        image: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        // explicitly NOT selected: password, isOwner (business flag, not personal data)
      },
    });
    if (!userRow) {
      throw new NotFoundException(`User with ID ${query.userId} not found`);
    }

    const accountRows = await this.drizzle.db
      .select({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
        scope: account.scope,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      })
      .from(account)
      .where(eq(account.userId, query.userId));

    const sessionRows = await this.drizzle.db
      .select({
        id: session.id,
        provider: session.provider,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .from(session)
      .where(eq(session.userId, query.userId));

    const consentRows = await this.drizzle.db
      .select({
        id: consent.id,
        purpose: consent.purpose,
        version: consent.version,
        grantedAt: consent.grantedAt,
        revokedAt: consent.revokedAt,
        createdAt: consent.createdAt,
        updatedAt: consent.updatedAt,
      })
      .from(consent)
      .where(eq(consent.userId, query.userId));

    return {
      user: userRow,
      accounts: accountRows,
      sessions: sessionRows,
      consents: consentRows,
    };
  }
}
