import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { User, type UserState } from './entities/user.aggregate';
import { Email } from './value-objects/email';

const now = () => new Date('2026-01-01T00:00:00.000Z');

const baseState = (over: Partial<UserState> = {}): UserState => ({
  id: 'u-1',
  email: 'a@b.com',
  firstName: null,
  lastName: null,
  role: 'USER',
  passwordHash: 'hash',
  createdAt: now(),
  updatedAt: now(),
  ...over,
});

describe('User aggregate (domain)', () => {
  it('register() creates a new aggregate and records user.registered', () => {
    const user = User.register({
      id: 'u-2',
      email: 'new@example.com',
      passwordHash: 'hashed',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(user.isNew).toBe(true);
    expect(user.email).toBe('new@example.com');
    expect(user.role).toBe('USER');
    expect(user.fullName).toBe('Ada Lovelace');

    const events = user.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('user.registered');
    expect(events[0].payload).toEqual({
      id: 'u-2',
      email: 'new@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      role: 'USER',
    });
  });

  it('register() derives fullName from email when names absent', () => {
    const user = User.register({ id: 'u-3', email: 'solo@example.com', passwordHash: 'h' });
    expect(user.firstName).toBeNull();
    expect(user.fullName).toBe('solo@example.com');
  });

  it('register() rejects an invalid email (domain invariant)', () => {
    expect(() =>
      User.register({ id: 'u-4', email: 'not-an-email', passwordHash: 'h' }),
    ).toThrowError(/Invalid email/);
  });

  it('pullDomainEvents() returns and clears the buffer', () => {
    const user = User.register({ id: 'u-5', email: 'p@q.com', passwordHash: 'h' });
    expect(user.pullDomainEvents()).toHaveLength(1);
    expect(user.pullDomainEvents()).toHaveLength(0);
  });

  it('rehydrate() yields a persisted aggregate with no pending events', () => {
    const user = User.rehydrate(baseState({ email: 'r@s.com' }));
    expect(user.isNew).toBe(false);
    expect(user.domainEvents).toHaveLength(0);
    expect(user.id).toBe('u-1');
  });

  it('changeEmail() and rename() mutate state and bump updatedAt', () => {
    const user = User.rehydrate(baseState({ updatedAt: new Date(0) }));
    user.changeEmail('changed@x.com');
    user.rename('Grace', 'Hopper');
    expect(user.email).toBe('changed@x.com');
    expect(user.fullName).toBe('Grace Hopper');
    expect(user.updatedAt.getTime()).toBeGreaterThan(0);
  });
});

describe('Email value object', () => {
  it('preserves original casing', () => {
    expect(Email.create('MixedCase@Example.COM').value).toBe('MixedCase@Example.COM');
  });
  it('compares case-insensitively', () => {
    expect(Email.create('A@B.com').equals(Email.create('a@b.COM'))).toBe(true);
  });
  it('rejects malformed addresses', () => {
    expect(Email.isValid('nope')).toBe(false);
    expect(() => Email.create('nope')).toThrowError();
  });
});

describe('domain purity (Clean Architecture constraint)', () => {
  const domainFiles = [
    './entities/user.aggregate.ts',
    './value-objects/email.ts',
    './events/user-registered.event.ts',
    './repositories/user.repository.ts',
  ];

  for (const rel of domainFiles) {
    it(`${rel} imports no framework/ORM`, () => {
      const source = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      expect(source).not.toMatch(/from '@nestjs\//);
      expect(source).not.toMatch(/from '@mikro-orm\//);
      expect(source).not.toMatch(/from '@app\/database/);
    });
  }
});
