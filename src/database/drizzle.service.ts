import { ConfigService } from '@app/config/config.service';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DrizzleService.name);
  private readonly client: Sql;
  readonly db: PostgresJsDatabase<typeof schema>;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    this.client = postgres(this.configService.getDatabaseConfig().url, {
      max: 10,
      onnotice: () => {},
    });
    this.db = drizzle(this.client, { schema });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client`SELECT 1`;
      this.logger.log('Successfully connected to the database');
    } catch (error) {
      this.logger.error(`Failed to connect to the database: ${error.message}`, error.stack);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.end();
      this.logger.log('Successfully disconnected from the database');
    } catch (error) {
      this.logger.error(`Failed to disconnect from the database: ${error.message}`, error.stack);
      throw error;
    }
  }
}
