import type { DrizzleService } from '@app/database/drizzle.service';
import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetUsersQuery } from '../get-users.query';
import { GetUsersQueryHandler } from './get-users.query-handler';

/**
 * users 列表分页直查测（业务面补分页片·DoD ②）：handler 无 port，
 * 锁定两发（rows 带 limit/offset 然后 count）与 createPage 信封收口。
 */
describe('GetUsersQueryHandler · pagination (rows + count, Page<T> envelope)', () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const select = vi.fn(() => ({ from: vi.fn(() => Promise.resolve([{ count: 9 }])) }));
  const db = {
    query: { user: { findMany } },
    select,
  } as unknown as DrizzleService['db'];
  const drizzle = { db } as unknown as DrizzleService;
  let handler: GetUsersQueryHandler;

  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    select.mockClear();
    handler = new GetUsersQueryHandler(drizzle);
  });

  it('rows 一发下传 limit/offset，count 二发，返回 Page 信封', async () => {
    const rows = [{ id: 'u1', email: 'a@b.c' }];
    findMany.mockResolvedValueOnce(rows);

    const page = await handler.execute(new GetUsersQuery({ limit: 5, offset: 10 }));

    const options = findMany.mock.calls[0][0] as { limit: number; offset: number };
    expect(options.limit).toBe(5);
    expect(options.offset).toBe(10);
    expect(page).toEqual({ items: rows, total: 9, limit: 5, offset: 10 });
    expect(page.items).not.toBe(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('缺省页参数原样透传（DTO 层已给默认值，handler 不再兜底）', async () => {
    const page = await handler.execute(new GetUsersQuery({ limit: 20, offset: 0 }));
    expect(page).toEqual({ items: [], total: 9, limit: 20, offset: 0 });
  });

  it('裸 Error 从 db 抛出时 fail-loud 上抛（由全局 filter 兜底 500）', async () => {
    findMany.mockRejectedValueOnce(new ForbiddenException('nope'));
    await expect(
      handler.execute(new GetUsersQuery({ limit: 20, offset: 0 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
