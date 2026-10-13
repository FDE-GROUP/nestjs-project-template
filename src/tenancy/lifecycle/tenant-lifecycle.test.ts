import { describe, expect, it } from 'vitest';
import {
  isTenantActive,
  isTenantBlocked,
  readTenantStatus,
  TENANT_STATUS,
  withTenantStatus,
} from './tenant-lifecycle';

describe('tenant-lifecycle (S4 · FR-1 状态机纯函数)', () => {
  describe('readTenantStatus', () => {
    it('reads a valid status from a jsonb object', () => {
      expect(readTenantStatus({ status: 'pending_approval' })).toBe(TENANT_STATUS.PENDING);
      expect(readTenantStatus({ status: 'active', foo: 1 })).toBe(TENANT_STATUS.ACTIVE);
    });

    it('tolerates a JSON string payload', () => {
      expect(readTenantStatus('{"status":"suspended"}')).toBe(TENANT_STATUS.SUSPENDED);
    });

    it('returns undefined for missing / illegal / non-object', () => {
      expect(readTenantStatus(undefined)).toBeUndefined();
      expect(readTenantStatus(null)).toBeUndefined();
      expect(readTenantStatus({})).toBeUndefined();
      expect(readTenantStatus({ status: 'bogus' })).toBeUndefined();
      expect(readTenantStatus('not-json')).toBeUndefined();
    });
  });

  describe('withTenantStatus', () => {
    it('merges status preserving other keys', () => {
      expect(withTenantStatus({ plan: 'pro', status: 'pending_approval' }, 'active')).toEqual({
        plan: 'pro',
        status: 'active',
      });
    });

    it('starts a fresh object when metadata is absent', () => {
      expect(withTenantStatus(undefined, 'active')).toEqual({ status: 'active' });
    });
  });

  describe('isTenantActive (strict allow-list)', () => {
    it('is true only for explicit active', () => {
      expect(isTenantActive({ status: 'active' })).toBe(true);
      expect(isTenantActive({ status: 'pending_approval' })).toBe(false);
      expect(isTenantActive({})).toBe(false);
    });
  });

  describe('isTenantBlocked (S4 deny-list)', () => {
    it('blocks explicit lifecycle-stop states', () => {
      for (const s of ['pending_approval', 'suspended', 'deleted']) {
        expect(isTenantBlocked({ status: s })).toBe(true);
      }
    });

    it('does NOT block active or unrecorded status (back-compat · 存量/seeded)', () => {
      expect(isTenantBlocked({ status: 'active' })).toBe(false);
      expect(isTenantBlocked({})).toBe(false);
      expect(isTenantBlocked(undefined)).toBe(false);
    });
  });
});
