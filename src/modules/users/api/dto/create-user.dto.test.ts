import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from './create-user.dto';

const validatePayload = async (payload: Record<string, unknown>) => {
  const instance = plainToInstance(CreateUserDto, payload);
  return validate(instance);
};

describe('CreateUserDto validation', () => {
  it('accepts a fully valid payload', async () => {
    const errors = await validatePayload({
      email: 'ok@example.com',
      password: 'longEnough123',
      firstName: 'Alice',
      lastName: 'Doe',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts payload without optional names', async () => {
    const errors = await validatePayload({
      email: 'ok@example.com',
      password: 'longEnough123',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const errors = await validatePayload({
      email: 'not-an-email',
      password: 'longEnough123',
    });
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('rejects a missing email', async () => {
    const errors = await validatePayload({ password: 'longEnough123' });
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('rejects a password shorter than 8 characters', async () => {
    const errors = await validatePayload({
      email: 'ok@example.com',
      password: 'short',
    });
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('rejects a missing password', async () => {
    const errors = await validatePayload({ email: 'ok@example.com' });
    expect(errors.map((e) => e.property)).toContain('password');
  });
});
