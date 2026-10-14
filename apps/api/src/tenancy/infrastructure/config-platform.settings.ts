import { ConfigService } from '@app/config/config.service';
import type { PlatformSettings } from '@core/saas-kit/tenancy/platform/platform-config.port';
import { Inject, Injectable } from '@nestjs/common';

/**
 * `PlatformSettings` 的参考应用侧适配（§9.5.3 热点③ · P1c）。
 *
 * 把 core 的平台配置消费落到具体 `ConfigService.getPlatformConfig()`（env 加载留应用侧）。
 * `ConfigService` 经 @Global ConfigModule 全局可用（S9 boot 修复）。
 */
@Injectable()
export class ConfigPlatformSettings implements PlatformSettings {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  operatorEmail(): string | undefined {
    return this.config.getPlatformConfig().operatorEmail;
  }
}
