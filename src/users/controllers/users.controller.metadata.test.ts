import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CreateUserDto } from '../dto/create-user.dto';
import { UsersController } from './users.controller';

// Regression test: the previous `import type { CreateUserDto }` erasure
// caused SWC to strip the class from `design:paramtypes`, so ValidationPipe
// silently skipped runtime validation for @Body payloads.
// If this test ever fails, HTTP-level DTO validation is broken again.
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
