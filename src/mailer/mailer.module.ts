import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { I18nModule } from 'nestjs-i18n';
import { MailerService } from './mailer.service';

@Module({
  imports: [
    ConfigModule,
    // PIPL/大陆适配 FR-5 · L1 全量翻译：接入 nestjs-i18n。加载 src/i18n/{en,zh,ja}/*.json
    // （构建时经 nest-cli assets 拷入 dist/i18n，故 __dirname/../i18n 开发/生产通用）。
    // 邮件按显式 lang 入参本地化，无需 HTTP resolver，故 resolvers 留空、fallback zh。
    I18nModule.forRoot({
      fallbackLanguage: 'zh',
      loaderOptions: {
        path: path.join(__dirname, '..', 'i18n'),
        watch: false,
      },
      resolvers: [],
    }),
  ],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
