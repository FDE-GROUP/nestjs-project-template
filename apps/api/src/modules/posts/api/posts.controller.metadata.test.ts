import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ListCursorDto } from '../../../common/dto/list-cursor.dto';
import { PostsController } from './posts.controller';

// 业务面补分页片（游标版）：list() 的 @Query ListCursorDto 必须留在 design:paramtypes——
// 被 `import type` 擦除则 limit/cursor 的 transform+校验整链静默跳过（S9 同形风险）。
describe('PostsController parameter metadata', () => {
  it('preserves ListCursorDto as design:paramtypes for @Query validation on list', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      PostsController.prototype,
      'list',
    ) as unknown[];

    expect(paramTypes[0]).toBe(ListCursorDto);
  });
});
