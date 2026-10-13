/**
 * 平台配置端口（global-tenancy §9.5.3 热点③ / §9.5.4①B · P1c 配置端口）。
 *
 * tenancy core（`PlatformOperatorGuard`）需要「全局唯一 Platform Operator 的 email」这一平台配置，
 * 但**不得** import 应用侧 `@app/config` 的具体 `ConfigService`。核心只消费本端口，具体 env 加载
 * 由参考应用侧适配（`infrastructure/config-platform.settings`·包 `ConfigService.getPlatformConfig`）提供。
 */

export const PLATFORM_SETTINGS = Symbol('PLATFORM_SETTINGS');

export interface PlatformSettings {
  /** 平台经营者 email（未配置 → undefined·守卫据此 fail-closed）。 */
  operatorEmail(): string | undefined;
}
