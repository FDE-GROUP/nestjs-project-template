import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AppI18nModule } from './i18n/i18n.module';
import { LoggerModule } from './logger/logger.module';
import { MailerModule } from './mailer/mailer.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PostsModule } from './modules/posts/posts.module';
import { StorageModule } from './modules/storage/storage.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    AppI18nModule,
    CommonModule,
    AuthModule.forRoot(),
    TenancyModule,
    UsersModule,
    PostsModule,
    WorkspacesModule,
    StorageModule.register(),
    PaymentModule.register(),
    MailerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
