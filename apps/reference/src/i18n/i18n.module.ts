import { Global, Module } from '@nestjs/common';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';

// PIPL/大陆适配 FR-5 · L1 全量翻译：单一 I18n 源，供 mailer 本地化与 HTTP 校验本地化共用。
// - fallback `zh`：无 `accept-language` 头时默认中文（契合"默认中文"）。
// - loader 读 `src/i18n`（本模块即位于该目录；构建时 nest-cli assets 已把 json 拷入
//   `dist/i18n`，故 `__dirname` 开发/生产通用）。
// - `AcceptLanguageResolver`：HTTP 校验消息按请求 `accept-language` 本地化。
const translations = I18nModule.forRoot({
  fallbackLanguage: 'zh',
  loaderOptions: {
    path: __dirname,
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
