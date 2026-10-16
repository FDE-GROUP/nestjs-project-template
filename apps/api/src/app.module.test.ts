import { describe, expect, it } from 'vitest';

describe('Application', () => {
  it('should have proper module structure', async () => {
    await expect(import('./app.module')).resolves.toBeDefined();
    await expect(import('./config/config.module')).resolves.toBeDefined();
    await expect(import('./database/database.module')).resolves.toBeDefined();
    await expect(import('./modules/users/users.module')).resolves.toBeDefined();
  });

  it('should have proper infrastructure and application structure', async () => {
    await expect(import('./config/config.service')).resolves.toBeDefined();
    await expect(
      import('./modules/users/infrastructure/repositories/mikro-user.repository'),
    ).resolves.toBeDefined();
    await expect(
      import('./modules/users/application/commands/handlers/delete-user.command-handler'),
    ).resolves.toBeDefined();
  });

  it('should have proper controller structure', async () => {
    await expect(import('./modules/users/api/users.controller')).resolves.toBeDefined();
  });
});
