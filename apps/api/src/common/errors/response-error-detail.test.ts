import type { ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { fromValidationErrors } from './response-error-detail';

/**
 * `fromValidationErrors` 单测（就绪预备 #3·丙裁）：把 class-validator 的 ValidationError 树
 * 递归展平为字段级明细——锁定 path 前缀拼接、每个 constraint 各产一行、children 递归三条契约。
 */

function node(
  partial: Partial<ValidationError> & Pick<ValidationError, 'property'>,
): ValidationError {
  return {
    value: undefined,
    target: undefined,
    property: partial.property,
    children: partial.children ?? [],
    constraints: partial.constraints ?? {},
  } as ValidationError;
}

describe('fromValidationErrors', () => {
  it('空树产空数组', () => {
    expect(fromValidationErrors([])).toEqual([]);
  });

  it('单节点多约束各产一行，path=property', () => {
    const errors = [
      node({
        property: 'email',
        constraints: { isEmail: '请输入正确的邮箱', isNotEmpty: '邮箱不能为空' },
      }),
    ];
    expect(fromValidationErrors(errors)).toEqual([
      { path: 'email', message: '请输入正确的邮箱' },
      { path: 'email', message: '邮箱不能为空' },
    ]);
  });

  it('嵌套 children 递归展平并以前缀拼接 path', () => {
    const errors = [
      node({
        property: 'profile',
        constraints: {},
        children: [
          node({ property: 'nickname', constraints: { maxLength: '昵称过长' } }),
          node({
            property: 'address',
            constraints: { isString: '地址须为字符串' },
            children: [node({ property: 'city', constraints: { isNotEmpty: '城市必填' } })],
          }),
        ],
      }),
    ];
    expect(fromValidationErrors(errors)).toEqual([
      { path: 'profile.nickname', message: '昵称过长' },
      { path: 'profile.address', message: '地址须为字符串' },
      { path: 'profile.address.city', message: '城市必填' },
    ]);
  });

  it('无 constraints 且无 children 的叶子被跳过', () => {
    const errors = [node({ property: 'ghost', constraints: {} })];
    expect(fromValidationErrors(errors)).toEqual([]);
  });
});
