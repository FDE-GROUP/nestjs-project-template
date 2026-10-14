import { describe, expect, it } from 'vitest';
import { createPage, type Page, type PageRequest } from './pagination';

/** 分页契约单测（module-common-pagination-contract·丙裁：唯一构造点的形状纪律）。 */
describe('Page<T> 契约（shared-kernel）', () => {
  it('createPage 产出四字段全形（items/total/limit/offset·回显请求）', () => {
    const request: PageRequest = { limit: 20, offset: 40 };
    const page: Page<string> = createPage(['a', 'b'], 7, request);
    expect(page).toEqual({ items: ['a', 'b'], total: 7, limit: 20, offset: 40 });
  });

  it('items 为浅复制：源数组事后 mutation 不泄漏进已构造的 page', () => {
    const source = [{ id: 1 }];
    const page = createPage(source, 1, { limit: 10, offset: 0 });
    source.push({ id: 2 });
    expect(page.items).toHaveLength(1);
  });

  it('空结果集仍为合法页（total 独立于 items 长度）', () => {
    expect(createPage([], 0, { limit: 20, offset: 100 })).toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 100,
    });
  });
});
