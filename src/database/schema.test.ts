import { describe, expect, it } from 'vitest';
import { account, post, Role, roleEnum, schema, session, user, verification } from './schema';

describe('database schema', () => {
  it('exports every table under the schema aggregate', () => {
    expect(Object.keys(schema).sort()).toEqual(
      ['account', 'post', 'session', 'user', 'verification'].sort(),
    );
  });

  it('user table exposes the expected columns', () => {
    expect(user.id).toBeDefined();
    expect(user.email).toBeDefined();
    expect(user.emailVerified).toBeDefined();
    expect(user.role).toBeDefined();
    expect(user.createdAt).toBeDefined();
    expect(user.updatedAt).toBeDefined();
  });

  it('better-auth auxiliary tables expose their required columns', () => {
    expect(account.userId).toBeDefined();
    expect(account.providerId).toBeDefined();
    expect(session.token).toBeDefined();
    expect(session.userId).toBeDefined();
    expect(verification.identifier).toBeDefined();
    expect(verification.value).toBeDefined();
  });

  it('role enum values match the exported Role constants', () => {
    expect(roleEnum.enumValues).toEqual(['USER', 'ADMIN']);
    expect(Role.USER).toBe('USER');
    expect(Role.ADMIN).toBe('ADMIN');
  });

  it('post exposes its core columns', () => {
    expect(post.id).toBeDefined();
    expect(post.title).toBeDefined();
    expect(post.published).toBeDefined();
    expect(post.createdAt).toBeDefined();
  });
});
