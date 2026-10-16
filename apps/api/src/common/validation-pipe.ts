import { I18nValidationPipe } from 'nestjs-i18n';

/**
 * 全局校验管的**单一装配源**（SSOT）：生产入口 `main.ts` 与各 gated e2e harness 共用本工厂，
 * 消除「测试装配不复现生产 pipe → DTO 默认值/校验静默失效」的对拍缺口
 * （全栈 CI 拼 PG 首跑拓出：`@Query() ListCursorDto` 在无管装配下 `limit=undefined`→SQL `NaN`）。
 *
 * `I18nValidationPipe`（nestjs-i18n）校验并产出**原始 i18n key**；本地化文案由 CommonModule
 * 注册的 I18nValidationExceptionFilter 渲染（保标准错误外形、只翻译 `message`）。
 * locale 从 `accept-language` 头解析，兜底 `zh`。
 */
export function createValidationPipe(): I18nValidationPipe {
  return new I18nValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  });
}
