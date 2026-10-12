import { DrizzleService } from '@app/database/drizzle.service';
import { user } from '@app/database/schema';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { User } from '../../domain/entities/user.aggregate';
import type { UserRepository } from '../../domain/repositories/user.repository';
import { rowToState, toNewUserValues, toUserUpdateValues } from '../persistence/user.mapper';

const returnFields = {
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
};

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  private readonly logger = new Logger(DrizzleUserRepository.name);

  constructor(@Inject(DrizzleService) private readonly drizzle: DrizzleService) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.drizzle.db.query.user.findFirst({ where: eq(user.id, id) });
    return row ? User.rehydrate(rowToState(row)) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.drizzle.db.query.user.findFirst({ where: eq(user.email, email) });
    return row ? User.rehydrate(rowToState(row)) : null;
  }

  async save(u: User): Promise<User> {
    if (u.isNew) {
      const [row] = await this.drizzle.db
        .insert(user)
        .values(toNewUserValues(u))
        .returning(returnFields);
      u.attachPersistenceMetadata(row.createdAt, row.updatedAt);
      u.markExisting();
      this.logger.log(`Inserted user ${u.id}`);
      return u;
    }

    const [row] = await this.drizzle.db
      .update(user)
      .set(toUserUpdateValues(u))
      .where(eq(user.id, u.id))
      .returning(returnFields);
    u.attachPersistenceMetadata(row.createdAt, row.updatedAt);
    return u;
  }

  async remove(id: string): Promise<void> {
    await this.drizzle.db.delete(user).where(eq(user.id, id));
  }
}
