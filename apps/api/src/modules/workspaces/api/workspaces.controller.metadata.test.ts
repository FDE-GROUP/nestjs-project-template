import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ListPageDto } from '../../../common/dto/list-page.dto';
import { WorkspacesController } from './workspaces.controller';

// 业务面补分页片：list() 的 @Query ListPageDto 必须留在 design:paramtypes——
// 被 `import type` 擦除则 limit/offset 的 transform+校验整链静默跳过（S9 同形风险）。
describe('WorkspacesController parameter metadata', () => {
  it('preserves ListPageDto as design:paramtypes for @Query validation on list', () => {
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      WorkspacesController.prototype,
      'list',
    ) as unknown[];

    expect(paramTypes[0]).toBe(ListPageDto);
  });
});
