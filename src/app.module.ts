import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CommonModule } from './common/common.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './logger/logger.module';
import { MailerModule } from './mailer/mailer.module';
import { StorageModule } from './storage/storage.module';
import { StripeModule } from './stripe/stripe.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    DatabaseModule,
    CommonModule,
    AuthModule.forRoot(),
    UsersModule,
    StorageModule.register(),
    StripeModule,
    MailerModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
