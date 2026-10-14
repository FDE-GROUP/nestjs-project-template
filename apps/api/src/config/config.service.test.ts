import type { ConfigService as NestConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  const innerGet = vi.fn();
  const inner = { get: innerGet } as unknown as NestConfigService;
  let service: ConfigService;

  beforeEach(() => {
    innerGet.mockReset();
    service = new ConfigService(inner);
  });

  it('returns the underlying value for a defined key', () => {
    innerGet.mockReturnValue({ url: 'postgres://x' });
    expect(service.getDatabaseConfig()).toEqual({ url: 'postgres://x' });
    expect(innerGet).toHaveBeenCalledWith('database');
  });

  it('throws when the requested key is undefined', () => {
    innerGet.mockReturnValue(undefined);
    expect(() => service.get('missing-key')).toThrow('Configuration key missing-key is undefined');
  });

  it('exposes typed getters for every config section', () => {
    const registry: Record<string, unknown> = {
      app: { port: 7009 },
      oauth: { providers: [] },
      auth: { jwt: {} },
      database: { url: 'postgres://x' },
      storage: { provider: 's3' },
      cors: { origin: '*' },
      swagger: { path: 'apidoc' },
      stripe: { apiVersion: '2025-02-24.acacia' },
    };
    innerGet.mockImplementation((key: string) => registry[key]);

    expect(service.getAppConfig()).toEqual(registry.app);
    expect(service.getOAuthConfig()).toEqual(registry.oauth);
    expect(service.getAuthConfig()).toEqual(registry.auth);
    expect(service.getDatabaseConfig()).toEqual(registry.database);
    expect(service.getStorageConfig()).toEqual(registry.storage);
    expect(service.getCorsConfig()).toEqual(registry.cors);
    expect(service.getSwaggerConfig()).toEqual(registry.swagger);
    expect(service.getStripeConfig()).toEqual(registry.stripe);
  });
});
