import { currentRequestId } from '@core/saas-kit/shared-kernel/context/request-context';
import { AggregateRoot } from '@core/saas-kit/shared-kernel/domain/aggregate-root';
import { UserRegisteredEvent } from '../events/user-registered.event';
import { Email } from '../value-objects/email';

export type UserRole = 'USER' | 'ADMIN';

export interface UserRegisterProps {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly role?: UserRole;
}

export interface UserState {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User aggregate root. Pure domain: no Nest, no Drizzle, no DTOs.
 * State transitions record domain events; the repository/command layer persists
 * and dispatches them (ES-ready seam).
 */
export class User extends AggregateRoot<string> {
  private constructor(private readonly _state: UserState) {
    super();
  }

  /** Factory for a brand-new registration; records `user.registered`. */
  static register(props: UserRegisterProps): User {
    const email = Email.create(props.email);
    const now = new Date();
    const state: UserState = {
      id: props.id,
      email: email.value,
      firstName: props.firstName ?? null,
      lastName: props.lastName ?? null,
      role: props.role ?? 'USER',
      passwordHash: props.passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    const user = new User(state);
    user.recordEvent(
      new UserRegisteredEvent({
        aggregateId: state.id,
        // 关联 id 统一链（FR-4）：注册经 HTTP 请求时携带，种子/脚本场景 undefined。
        correlationId: currentRequestId(),
        payload: {
          id: state.id,
          email: state.email,
          firstName: state.firstName,
          lastName: state.lastName,
          role: state.role,
        },
      }),
    );
    return user;
  }

  /** Rebuild an already-persisted aggregate (no events, not "new"). */
  static rehydrate(state: UserState): User {
    const user = new User({ ...state });
    user.markExisting();
    return user;
  }

  get id(): string {
    return this._state.id;
  }

  get email(): string {
    return this._state.email;
  }

  get firstName(): string | null {
    return this._state.firstName;
  }

  get lastName(): string | null {
    return this._state.lastName;
  }

  get role(): UserRole {
    return this._state.role;
  }

  get passwordHash(): string {
    return this._state.passwordHash;
  }

  // fallow-ignore-next-line unused-class-member -- intentional public read API of the aggregate
  get createdAt(): Date {
    return this._state.createdAt;
  }

  get updatedAt(): Date {
    return this._state.updatedAt;
  }

  /** Display name mirrors the legacy `name` column derivation. */
  get fullName(): string {
    return (
      [this._state.firstName, this._state.lastName].filter(Boolean).join(' ') || this._state.email
    );
  }

  changeEmail(raw: string): void {
    this._state.email = Email.create(raw).value;
    this._state.updatedAt = new Date();
  }

  rename(firstName: string | null, lastName: string | null): void {
    this._state.firstName = firstName ?? null;
    this._state.lastName = lastName ?? null;
    this._state.updatedAt = new Date();
  }

  /** Applied by the repository after insert so DB-managed timestamps are reflected. */
  attachPersistenceMetadata(createdAt: Date, updatedAt: Date): void {
    this._state.createdAt = createdAt;
    this._state.updatedAt = updatedAt;
  }

  // fallow-ignore-next-line unused-class-member -- called on the aggregate instance by command handlers
  toPublicProjection(): PublicUser {
    return {
      id: this._state.id,
      email: this._state.email,
      firstName: this._state.firstName,
      lastName: this._state.lastName,
      role: this._state.role,
      createdAt: this._state.createdAt,
      updatedAt: this._state.updatedAt,
    };
  }
}
