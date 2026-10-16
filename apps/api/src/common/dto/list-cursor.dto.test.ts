import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListCursorDto } from './list-cursor.dto';

/**
 * `ListCursorDto` 校验测（切片 B）：以与产线 I18nValidationPipe 同参数实跑 `validateSync`，
 * 锁 base64url 字符集校验 + 空串归一 + limit 边界。
 */
function validateLikePipe(instance: object) {
  return validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
}

describe('ListCursorDto（whitelist 同产线参数实跑）', () => {
  it('合法 cursor + limit 零报错', () => {
    const dto = plainToInstance(ListCursorDto, {
      limit: 10,
      cursor: 'WyIyMDI2LTAxLTAyVDAzOjA0OjA1LjAwMFoiLCJ1dWlkIl0',
    });
    expect(validateLikePipe(dto)).toEqual([]);
  });

  it('缺省 limit=20·cursor 未传', () => {
    const dto = plainToInstance(ListCursorDto, {});
    expect(validateLikePipe(dto)).toEqual([]);
    expect(dto.limit).toBe(20);
    expect(dto.cursor).toBeUndefined();
  });

  it('空串 cursor 归一为 undefined（视作首页）', () => {
    const dto = plainToInstance(ListCursorDto, { cursor: '' });
    expect(validateLikePipe(dto)).toEqual([]);
    expect(dto.cursor).toBeUndefined();
  });

  it('含非法字符（+/=空格）的 cursor 被拒', () => {
    const dto = plainToInstance(ListCursorDto, { cursor: 'abc+def/ghi=' });
    const errors = validateLikePipe(dto);
    expect(errors.map((e) => e.property)).toContain('cursor');
  });

  it('limit 越界仍被拒（与 ListPageDto 同律）', () => {
    const dto = plainToInstance(ListCursorDto, { limit: 0 });
    expect(validateLikePipe(dto).map((e) => e.property)).toContain('limit');
  });

  it('非白名单键仍被拒', () => {
    const dto = plainToInstance(ListCursorDto, { bogus: 1 });
    expect(validateLikePipe(dto).map((e) => e.property)).toContain('bogus');
  });
});
