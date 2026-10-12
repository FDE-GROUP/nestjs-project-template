import 'reflect-metadata';
import { DrizzleService } from '@app/database/drizzle.service';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';

// Integration test that exercises Nest's DI container end-to-end under Vitest.
// Proves: unplugin-swc's emitDecoratorMetadata correctly preserves @Injectable / @Inject types.
describe('UsersService (Nest DI)', () => {
  const findMany = vi.fn();
  const findFirst = vi.fn();
  const insertValuesReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertValuesReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const mockDb = {
    query: { user: { findMany, findFirst } },
    insert,
  };

  let service: UsersService;

  beforeEach(async () => {
    findMany.mockReset();
    findFirst.mockReset();
    insertValuesReturning.mockReset();
    // Keep chained factories' implementations, only clear call records
    insertValues.mockClear();
    insert.mockClear();

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: DrizzleService, useValue: { db: mockDb } }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('is resolvable through Nest DI (decorators + metadata are intact)', () => {
    expect(service).toBeInstanceOf(UsersService);
  });

  it('findAll delegates to drizzle relational query', async () => {
    findMany.mockResolvedValue([{ id: '1' }]);
    await expect(service.findAll()).resolves.toEqual([{ id: '1' }]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('findOne throws NotFoundException when user is missing', async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(/not found/i);
  });
});
