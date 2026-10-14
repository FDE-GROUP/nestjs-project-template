import type { Page } from '@core/shared-kernel/domain/pagination';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRecord } from '../../../domain/repositories/workspace.repository';
import type { WorkspaceReadModel } from '../../read-models/workspace.read-model';
import { ListWorkspacesQuery } from '../list-workspaces.query';
import { ListWorkspacesQueryHandler } from './list-workspaces.query-handler';

/**
 * workspaces 列表 query handler 透传测（业务面补分页片·DoD ④）：
 * 锁定 handler 把 PageRequest 原样交给 port，并把 Page 信封原样交回总线。
 */
describe('ListWorkspacesQueryHandler · page passthrough', () => {
  it('forwards query.request to the port and returns its Page envelope untouched', async () => {
    const page: Page<WorkspaceRecord> = { items: [], total: 0, limit: 7, offset: 3 };
    const list = vi.fn().mockResolvedValue(page);
    const handler = new ListWorkspacesQueryHandler({ list } as never);

    const request = { limit: 7, offset: 3 };
    const result = await handler.execute(new ListWorkspacesQuery(request));

    expect(list).toHaveBeenCalledWith(request);
    expect(result).toBe(page as Page<WorkspaceReadModel>);
  });
});
