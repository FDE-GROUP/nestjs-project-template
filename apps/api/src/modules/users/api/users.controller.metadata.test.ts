import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ListPageDto } from '../../../common/dto/list-page.dto';
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

  // 业务面补分页片：若 ListPageDto 被 `import type` 擦除，@Query 管道看不见 DTO 类型，
  // limit/offset 的 transform+校验整链静默跳过（query 原样字符串直达 handler）。
  it('preserves ListPageDto as design:paramtypes for @Query validation on findAll', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      UsersController.prototype,
      'findAll',
    ) as unknown[];

    expect(paramTypes[0]).toBe(ListPageDto);
  });
});
