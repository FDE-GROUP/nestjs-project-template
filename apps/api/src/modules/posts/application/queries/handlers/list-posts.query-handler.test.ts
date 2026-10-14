import type { Page } from '@core/shared-kernel/domain/pagination';
import { describe, expect, it, vi } from 'vitest';
import type { PostRecord } from '../../../domain/repositories/post.repository';
import { ListPostsQuery } from '../list-posts.query';
import { ListPostsQueryHandler } from './list-posts.query-handler';

/**
 * posts 列表 query handler 透传测（业务面补分页片·DoD ④）：
 * 锁定 handler 把 PageRequest 原样交给 port，Page 信封原样交回总线。
 */
describe('ListPostsQueryHandler · page passthrough', () => {
  it('forwards query.request to the port and returns its Page envelope untouched', async () => {
    const page: Page<PostRecord> = { items: [], total: 0, limit: 4, offset: 8 };
    const list = vi.fn().mockResolvedValue(page);
    const handler = new ListPostsQueryHandler({ list } as never);

    const request = { limit: 4, offset: 8 };
    const result = await handler.execute(new ListPostsQuery(request));

    expect(list).toHaveBeenCalledWith(request);
    expect(result).toBe(page);
  });
});
