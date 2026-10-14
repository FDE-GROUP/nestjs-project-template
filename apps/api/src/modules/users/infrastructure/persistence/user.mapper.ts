import type { user } from '@app/database/schema';
import type { User, UserState } from '../../domain/entities/user.aggregate';

type UserRow = typeof user.$inferSelect;

/** Insert payload derived from a fresh aggregate (mirrors legacy column mapping). */
export function toNewUserValues(u: User): typeof user.$inferInsert {
  return {
    id: u.id,
    name: u.fullName,
    email: u.email,
    password: u.passwordHash,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
  };
}

/** Update payload for an existing aggregate (id excluded). */
export function toUserUpdateValues(u: User): Partial<typeof user.$inferInsert> {
  return {
    name: u.fullName,
    email: u.email,
    password: u.passwordHash,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    updatedAt: new Date(),
  };
}

export function rowToState(row: UserRow): UserState {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    role: row.role as UserState['role'],
    passwordHash: row.password ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
