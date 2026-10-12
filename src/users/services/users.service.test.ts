import type { DrizzleService } from '@app/database/drizzle.service';
import { Role } from '@app/database/schema';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateUserDto } from '../dto/create-user.dto';
import { UsersService } from './users.service';

// Mock bcrypt (vi.mock is auto-hoisted to the top by Vitest)
vi.mock('bcryptjs', () => ({
  hash: vi.fn(() => Promise.resolve('hashed-password')),
}));

describe('UsersService', () => {
  let service: UsersService;

  // Mock Drizzle query + insert chain
  const mockFindMany = vi.fn();
  const mockFindFirst = vi.fn();
  const mockReturning = vi.fn();
  const mockValues = vi.fn(() => ({ returning: mockReturning }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  const mockDb = {
    query: { user: { findMany: mockFindMany, findFirst: mockFindFirst } },
    insert: mockInsert,
  };

  beforeEach(() => {
    service = new UsersService({ db: mockDb } as unknown as DrizzleService);

    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockReturning.mockReset();
    // Keep the chained implementations, only clear recorded calls
    mockValues.mockClear();
    mockInsert.mockClear();
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const expectedUsers = [
        {
          id: '1',
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User',
          role: Role.USER,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockFindMany.mockResolvedValue(expectedUsers);

      const result = await service.findAll();

      expect(result).toEqual(expectedUsers);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      const expectedUser = {
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindFirst.mockResolvedValue(expectedUser);

      const result = await service.findOne('1');

      expect(result).toEqual(expectedUser);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('999')).rejects.toThrow('User with ID 999 not found');
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      const expectedUser = {
        id: '1',
        email: 'test@example.com',
        password: 'hashed-password',
        firstName: 'Test',
        lastName: 'User',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindFirst.mockResolvedValue(expectedUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(expectedUser as any);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(service.findByEmail('nonexistent@example.com')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      email: 'newuser@example.com',
      password: 'plaintext-password',
      firstName: 'New',
      lastName: 'User',
    };

    it('should create a new user successfully', async () => {
      const expectedUser = {
        id: '2',
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // No existing user
      mockFindFirst.mockResolvedValue(null);
      // Insert chain resolves with created user
      mockReturning.mockResolvedValue([expectedUser]);

      const result = await service.create(createUserDto);

      expect(result).toEqual(expectedUser);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(mockValues).toHaveBeenCalledTimes(1);

      const valuesArg = (mockValues.mock.calls[0] as any[])[0] as any;
      expect(valuesArg.email).toBe('newuser@example.com');
      expect(valuesArg.password).toBe('hashed-password');
      expect(valuesArg.role).toBe(Role.USER);
    });

    it('should throw ConflictException when user already exists', async () => {
      const existingUser = {
        id: '1',
        email: 'newuser@example.com',
        password: 'existing-password',
        firstName: 'Existing',
        lastName: 'User',
        role: Role.USER,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockFindFirst.mockResolvedValue(existingUser);

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException);
      await expect(service.create(createUserDto)).rejects.toThrow(
        'User with email newuser@example.com already exists',
      );
    });
  });
});
