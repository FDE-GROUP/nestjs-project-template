// @vitest-environment jsdom
import type { components } from '@saas/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SubscriptionView } from './index';

type SubscriptionResponse = components['schemas']['SubscriptionResponse'];

const active: SubscriptionResponse = {
  hasSubscription: true,
  plan: 'pro',
  seatsLimit: 5,
  used: 2,
  remaining: 3,
  providerCustomerId: 'cus_123',
};

afterEach(cleanup);

describe('SubscriptionView（typed 订阅快照 / 空态）', () => {
  it('生效订阅 → 档位/座位/已用·剩余', () => {
    render(<SubscriptionView subscription={active} />);
    expect(screen.getByTestId('sub-plan').textContent).toBe('pro');
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('无生效订阅 → 空态', () => {
    render(<SubscriptionView subscription={null} />);
    expect(screen.getByText('当前租户尚无生效订阅。')).toBeTruthy();
  });

  it('hasSubscription=false → 空态', () => {
    render(<SubscriptionView subscription={{ ...active, hasSubscription: false }} />);
    expect(screen.getByText('当前租户尚无生效订阅。')).toBeTruthy();
  });
});
