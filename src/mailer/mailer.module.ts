import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from './mailer.service';

// I18nService 由全局 AppI18nModule 提供（见 src/i18n/i18n.module.ts），此处直接注入即可。
@Module({
  imports: [ConfigModule],
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
