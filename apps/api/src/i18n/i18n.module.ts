import { Global, Module } from '@nestjs/common';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import { resolveI18nAssetsRoot } from './assets-root';

// PIPL/大陆适配 FR-5 · L1 全量翻译：单一 I18n 源，供 mailer 本地化与 HTTP 校验本地化共用。
// - fallback `zh`：无 `accept-language` 头时默认中文（契合"默认中文"）。
// - loader 根经 `resolveI18nAssetsRoot()` 单点解析（源码/产物两套布局同一机制，资产缺失启动即抛），
//   不再直接取本模块 `dirname`——那在产物布局下指向无 json/mjml 的目录（见 plan module-i18n-assets-resolution）。
// - `AcceptLanguageResolver`：HTTP 校验消息按请求 `accept-language` 本地化。
const translations = I18nModule.forRoot({
  fallbackLanguage: 'zh',
  loaderOptions: {
    path: resolveI18nAssetsRoot(),
    watch: false,
  },
  resolvers: [new AcceptLanguageResolver()],
});

@Global()
@Module({
  imports: [translations],
  exports: [translations],
})
export class AppI18nModule {}
