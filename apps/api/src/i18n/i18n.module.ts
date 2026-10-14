import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Global, Module } from '@nestjs/common';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';

// Node ESM 无 `__dirname`（Bun 静默注入，Node 不），此处以 `import.meta.url` 等价推导，
// 保持与 CJS `__dirname` 同值（模块文件所在目录），跨运行时一致。
const dirname = path.dirname(fileURLToPath(import.meta.url));

// PIPL/大陆适配 FR-5 · L1 全量翻译：单一 I18n 源，供 mailer 本地化与 HTTP 校验本地化共用。
// - fallback `zh`：无 `accept-language` 头时默认中文（契合"默认中文"）。
// - loader 读 `src/i18n`（本模块即位于该目录；构建时 nest-cli assets 已把 json 拷入
//   `dist/i18n`，故 `__dirname` 开发/生产通用）。
// - `AcceptLanguageResolver`：HTTP 校验消息按请求 `accept-language` 本地化。
const translations = I18nModule.forRoot({
  fallbackLanguage: 'zh',
  loaderOptions: {
    path: dirname,
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
