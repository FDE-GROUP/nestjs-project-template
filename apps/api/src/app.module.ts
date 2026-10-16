import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { HealthModule } from './common/health/health.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
// ORM 修宪案 B · 切片 2：app-Mikro 装配根（@Global·懒建·不劫持 DB-free 装配冒烟）。
import { MikroOrmModule } from './database/mikro/mikro-orm.module';
import { AppI18nModule } from './i18n/i18n.module';
import { LoggerModule } from './logger/logger.module';
import { MailerModule } from './mailer/mailer.module';
import { AuthModule } from './modules/auth/auth.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PostsModule } from './modules/posts/posts.module';
import { StorageModule } from './modules/storage/storage.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TenancyModule } from './tenancy/tenancy.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    MikroOrmModule,
    AppI18nModule,
    CommonModule,
    HealthModule,
    AuthModule.forRoot(),
    TenancyModule,
    UsersModule,
    PostsModule,
    WorkspacesModule,
    TenantsModule,
    SubscriptionsModule,
    StorageModule.register(),
    PaymentModule.register(),
    MailerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
