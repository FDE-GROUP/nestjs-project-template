import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersController } from './users.controller';

// Regression test: an `import type { CreateUserDto }` erasure lets SWC strip the
// class from `design:paramtypes`, so ValidationPipe silently skips @Body validation.
// This locks the runtime metadata the HTTP contract depends on.
describe('UsersController parameter metadata', () => {
  it('preserves CreateUserDto as design:paramtypes for @Body validation', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      UsersController.prototype,
      'create',
    ) as unknown[];

    expect(Array.isArray(paramTypes)).toBe(true);
    expect(paramTypes[0]).toBe(CreateUserDto);
  });
});
