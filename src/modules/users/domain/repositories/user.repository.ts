import type { User } from '../entities/user.aggregate';

/**
 * Injection token for the User repository port (dependency inversion).
 * The concrete Drizzle-backed implementation lives in the infrastructure layer.
 */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Repository port defined by the domain. Pure — depends only on the User aggregate.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /** Persists a new or existing aggregate and returns it with DB-authoritative timestamps. */
  save(user: User): Promise<User>;
  remove(id: string): Promise<void>;
}
