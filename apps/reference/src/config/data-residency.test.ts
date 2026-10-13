import { describe, expect, it } from 'vitest';
import {
  assertDataResidency,
  extractDbHost,
  isMainlandDbHost,
  isMainlandStorageRegion,
  resolveEnforceMode,
} from './data-residency';

describe('data-residency · extractDbHost', () => {
  it('parses hostname from postgres URL', () => {
    expect(extractDbHost('postgres://u:p@pgm-xxx.pg.rds.aliyuncs.com:5432/db')).toBe(
      'pgm-xxx.pg.rds.aliyuncs.com',
    );
    expect(extractDbHost('postgresql://localhost:5432/nest')).toBe('localhost');
  });

  it('returns null for malformed URL', () => {
    expect(extractDbHost('not-a-url')).toBeNull();
    expect(extractDbHost('')).toBeNull();
  });
});

describe('data-residency · isMainlandDbHost', () => {
  it('accepts loopback and RFC1918 private ranges', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.5.9', '172.16.3.1', '192.168.1.1']) {
      expect(isMainlandDbHost(host)).toBe(true);
    }
  });

  it('accepts Aliyun / Tencent Cloud mainland endpoints', () => {
    expect(isMainlandDbHost('pgm-abc.pg.rds.aliyuncs.com')).toBe(true);
    expect(isMainlandDbHost('pc-xyz.o.polardb.cn-beijing.aliyuncs.com')).toBe(true);
    expect(isMainlandDbHost('mydb.tencentcloudapi.com')).toBe(true);
    expect(isMainlandDbHost('example.cn')).toBe(true);
  });

  it('rejects foreign hosts unless explicitly allowlisted', () => {
    expect(isMainlandDbHost('ec2.amazonaws.com')).toBe(false);
    expect(isMainlandDbHost('db.internal')).toBe(false);
    expect(isMainlandDbHost('db.my-idc.example.com', ['db.my-idc.example.com'])).toBe(true);
  });
});

describe('data-residency · isMainlandStorageRegion', () => {
  it('accepts OSS cn regions', () => {
    expect(isMainlandStorageRegion('alioss', 'oss-cn-hangzhou')).toBe(true);
    expect(isMainlandStorageRegion('alioss', 'oss-cn-beijing')).toBe(true);
    expect(isMainlandStorageRegion('alioss', 'oss-us-west-1')).toBe(false);
  });

  it('accepts COS mainland cities and rejects overseas', () => {
    expect(isMainlandStorageRegion('tencentoss', 'ap-guangzhou')).toBe(true);
    expect(isMainlandStorageRegion('tencentoss', 'ap-singapore')).toBe(false);
  });

  it('accepts AWS China partition and rejects global regions', () => {
    expect(isMainlandStorageRegion('s3', 'cn-north-1')).toBe(true);
    expect(isMainlandStorageRegion('s3', 'cn-northwest-1')).toBe(true);
    expect(isMainlandStorageRegion('s3', 'us-east-1')).toBe(false);
  });
});

describe('data-residency · assertDataResidency', () => {
  const clean = {
    databaseUrl: 'postgres://u:p@pgm-abc.pg.rds.aliyuncs.com:5432/db',
    storage: { provider: 'alioss', region: 'oss-cn-hangzhou', accessKeyId: 'k' },
  };

  it('strict mode with clean input yields no errors and no warnings', () => {
    expect(assertDataResidency(clean, 'strict')).toEqual({ errors: [], warnings: [] });
  });

  it('strict mode collects errors on foreign DB host', () => {
    const report = assertDataResidency(
      { ...clean, databaseUrl: 'postgres://x@ec2.amazonaws.com/db' },
      'strict',
    );
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatch(/ec2\.amazonaws\.com/);
    expect(report.warnings).toEqual([]);
  });

  it('warn mode routes violations to warnings, not errors', () => {
    const report = assertDataResidency(
      { ...clean, storage: { provider: 's3', region: 'us-east-1', accessKeyId: 'k' } },
      'warn',
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toMatch(/us-east-1/);
  });

  it('skips storage check when provider not configured (NFR-2 degrade)', () => {
    const report = assertDataResidency(
      { ...clean, storage: { provider: 's3', region: 'us-east-1' /* no accessKeyId */ } },
      'strict',
    );
    expect(report.errors).toEqual([]);
  });

  it('reports unparseable DATABASE_URL as a violation', () => {
    const report = assertDataResidency({ ...clean, databaseUrl: 'garbage' }, 'strict');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatch(/unparseable/);
  });
});

describe('data-residency · resolveEnforceMode', () => {
  it('defaults to strict only in production', () => {
    expect(resolveEnforceMode('production', undefined)).toBe('strict');
    expect(resolveEnforceMode('development', undefined)).toBe('warn');
    expect(resolveEnforceMode('test', undefined)).toBe('warn');
    expect(resolveEnforceMode(undefined, undefined)).toBe('warn');
  });

  it('env override wins over NODE_ENV', () => {
    expect(resolveEnforceMode('production', 'false')).toBe('warn');
    expect(resolveEnforceMode('development', 'true')).toBe('strict');
  });
});
