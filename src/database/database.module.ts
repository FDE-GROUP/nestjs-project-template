import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { DrizzleService } from './drizzle.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DatabaseModule {}
