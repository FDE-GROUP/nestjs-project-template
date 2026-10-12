import { describe, expect, it } from 'vitest';

describe('Application', () => {
  it('should have proper module structure', async () => {
    await expect(import('./app.module')).resolves.toBeDefined();
    await expect(import('./config/config.module')).resolves.toBeDefined();
    await expect(import('./database/database.module')).resolves.toBeDefined();
    await expect(import('./users/users.module')).resolves.toBeDefined();
  });

  it('should have proper service structure', async () => {
    await expect(import('./config/config.service')).resolves.toBeDefined();
    await expect(import('./users/services/users.service')).resolves.toBeDefined();
  });

  it('should have proper controller structure', async () => {
    await expect(import('./users/controllers/users.controller')).resolves.toBeDefined();
  });
});
