import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportUserDataQuery } from '../export-user-data.query';
import { ExportUserDataQueryHandler } from './export-user-data.query-handler';

function makeChain(results: unknown[]) {
  let i = 0;
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(results[i++])),
      })),
    })),
  };
}

const baseUserRow = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Ann',
  handle: 'ann',
  image: null,
  firstName: 'Ann',
  lastName: 'L',
  role: 'USER',
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  // Simulate raw row that also carries sensitive fields to prove projection strips them:
  password: 'should-not-appear',
  isOwner: true,
};

describe('ExportUserDataQueryHandler (PIPL right-to-access · C1)', () => {
  const findFirst = vi.fn();
  const chain = makeChain([[], [], []]);
  const db = { query: { user: { findFirst } }, select: chain.select };
  let handler: ExportUserDataQueryHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    chain.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    }));
    handler = new ExportUserDataQueryHandler({ db } as never);
  });

  it('throws NotFound when user missing', async () => {
    findFirst.mockResolvedValue(undefined);
    await expect(handler.execute(new ExportUserDataQuery('ghost'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('aggregates user + accounts + sessions + consents and never leaks credentials', async () => {
    findFirst.mockResolvedValue(baseUserRow);
    // Simulate projection: handler picks only whitelisted cols, so downstream
    // rows are shaped accordingly. Our mock returns pre-shaped arrays.
    const accounts = [{ id: 'a1', providerId: 'feishu', accountId: 'fs1' }];
    const sessions = [{ id: 's1', provider: null }];
    const consents = [{ id: 'c1', purpose: 'terms', version: 'v1' }];
    let call = 0;
    chain.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const buckets = [accounts, sessions, consents];
          return Promise.resolve(buckets[call++]);
        }),
      })),
    }));

    const result = await handler.execute(new ExportUserDataQuery('u1'));

    expect(result.user.id).toBe('u1');
    // findFirst receives an explicit column projection that omits password/isOwner.
    const projectionArg = findFirst.mock.calls[0][0] as { columns: Record<string, boolean> };
    expect(projectionArg.columns).toMatchObject({
      id: true,
      email: true,
      name: true,
      handle: true,
    });
    expect(projectionArg.columns.password).toBeUndefined();
    expect(projectionArg.columns.isOwner).toBeUndefined();
    expect(result.accounts).toEqual(accounts);
    expect(result.sessions).toEqual(sessions);
    expect(result.consents).toEqual(consents);
    // three `select()` calls (accounts / sessions / consents)
    expect(chain.select).toHaveBeenCalledTimes(3);
  });
});
