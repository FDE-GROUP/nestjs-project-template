import { requestStorage } from '@core/saas-kit/shared-kernel/context/request-context';
import { describe, expect, it } from 'vitest';
import { User } from './user.aggregate';

/**
 * user.registered 构造点 correlationId 穿透测
 * （module-common-request-correlation · FR-4 样本①·纯域零 mock）。
 */
const props = {
  id: 'u-1',
  email: 'a@b.cn',
  firstName: 'A',
  lastName: 'B',
  role: 'USER' as const,
  passwordHash: 'hash-1',
};

describe('User.register correlationId 穿透', () => {
  it('请求上下文内注册：事件携带当前 requestId', async () => {
    await requestStorage.run({ requestId: 'rq-42' }, () => {
      const user = User.register(props);
      const [event] = user.pullDomainEvents();
      expect(event?.correlationId).toBe('rq-42');
    });
  });

  it('上下文之外（种子/脚本）：correlationId 为 undefined，持久化仍落 null 语义不变', () => {
    const user = User.register(props);
    const [event] = user.pullDomainEvents();
    expect(event?.correlationId).toBeUndefined();
  });
});
