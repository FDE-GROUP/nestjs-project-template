import type { CursorPage } from '@core/saas-kit/shared-kernel/domain/pagination';
import { describe, expect, it, vi } from 'vitest';
import type { PostRecord } from '../../../domain/repositories/post.repository';
import { ListPostsQuery } from '../list-posts.query';
import { ListPostsQueryHandler } from './list-posts.query-handler';

/**
 * posts 列表 query handler 透传测（就绪预备切片 B·游标版）：
 * 锁定 handler 把 CursorPageRequest 原样交给 port，CursorPage 信封原样交回总线。
 */
describe('ListPostsQueryHandler · cursor page passthrough', () => {
  it('forwards query.request to the port and returns its CursorPage envelope untouched', async () => {
    const page: CursorPage<PostRecord> = { items: [], hasMore: true, nextCursor: 'cur-1' };
    const list = vi.fn().mockResolvedValue(page);
    const handler = new ListPostsQueryHandler({ list } as never);

    const request = { limit: 4, cursor: 'prev' };
    const result = await handler.execute(new ListPostsQuery(request));

    expect(list).toHaveBeenCalledWith(request);
    expect(result).toBe(page);
  });
});
