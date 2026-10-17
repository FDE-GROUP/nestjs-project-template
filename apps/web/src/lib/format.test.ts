import { describe, expect, it } from 'vitest';
import { describeApiError, formatDate } from './format';

describe('formatDate', () => {
  it('ISO → YYYY-MM-DD', () => {
    expect(formatDate('2026-01-02T03:04:05.000Z')).toBe('2026-01-02');
  });
  it('无法解析 → 回落原串（不渲染 NaN）', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('describeApiError（据 @core 单源窄化错误码）', () => {
  it('带 errorCode → 「message（CODE）」', () => {
    expect(
      describeApiError({ message: '禁止访问', errorCode: 'TENANCY:ACTIVE_TENANT_REQUIRED' }),
    ).toBe('禁止访问（TENANCY:ACTIVE_TENANT_REQUIRED）');
  });
  it('无 errorCode → 仅 message', () => {
    expect(describeApiError({ message: '服务器开小差' })).toBe('服务器开小差');
  });
  it('message 数组（校验面）→ 分号连接', () => {
    expect(describeApiError({ message: ['字段 a 非法', '字段 b 非法'] })).toBe(
      '字段 a 非法; 字段 b 非法',
    );
  });
  it('空体 → 兜底文案', () => {
    expect(describeApiError({})).toBe('请求失败');
  });
});
