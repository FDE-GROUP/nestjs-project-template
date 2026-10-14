import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListPlatformTenantsDto } from '../../modules/tenants/api/dto/list-platform-tenants.dto';
import { ListPageDto } from './list-page.dto';

/**
 * DTO 继承链回归测（module-common-pagination-contract · plan §7 唯一技术雷）：
 * 产线 I18nValidationPipe 走 `whitelist + forbidNonWhitelisted`——若 class-validator
 * 元数据遍历丢**父类装饰器属性**，limit/offset 会被当非白名单键整体 400 化。
 * 本测以与 pipe 同参数实跑 `validateSync`，锁死继承面校验元数据可读回。
 */
function validateLikePipe(instance: object) {
  return validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('ListPageDto 继承链（whitelist 同产线参数实跑）', () => {
  it('合法分页参数（含继承属性）零报错——父类装饰器未丢', () => {
    const dto = plainToInstance(ListPlatformTenantsDto, { limit: 5, offset: 10, search: 'ac' });
    expect(validateLikePipe(dto)).toEqual([]);
  });

  it('继承属性照常受校验：limit=101 → @Max(100) 报错', () => {
    const dto = plainToInstance(ListPlatformTenantsDto, { limit: 101 });
    const errors = validateLikePipe(dto);
    expect(errors.map((e) => e.property)).toContain('limit');
  });

  it('非白名单键仍被拒（继承未放松 forbidNonWhitelisted）', () => {
    const dto = plainToInstance(ListPlatformTenantsDto, { bogus: 1 });
    const errors = validateLikePipe(dto);
    expect(errors.map((e) => e.property)).toContain('bogus');
  });

  it('缺省走基类默认值 limit=20/offset=0（字段初始化器经继承仍生效）', () => {
    const dto = plainToInstance(ListPageDto, {});
    expect(validateLikePipe(dto)).toEqual([]);
    expect(dto).toMatchObject({ limit: 20, offset: 0 });
  });
});
