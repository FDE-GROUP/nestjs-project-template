import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import Joi from 'joi';
import { ConfigService } from './config.service';
import defaultConfig from './envs/default';
import developmentConfig from './envs/development';
import productionConfig from './envs/production';

// Create different schemas based on environment
const createSchemaForEnv = (_isProd: boolean) => {
  // Base schema for all environments
  const baseSchema = {
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    PORT: Joi.number().default(7009),
    HOST: Joi.string().default('localhost'),
    API_PREFIX: Joi.string().default('api'),
    OPEN_API_VERSION: Joi.string().default('3.1.0'),
    DATABASE_URL: Joi.string()
      .uri({ scheme: ['postgres', 'postgresql'] })
      .required(),
    JWT_SECRET: Joi.string().required(),
    ALLOWED_ORIGINS: Joi.string().required(),
    JWT_EXPIRES_IN: Joi.string().default('30d'),
    JWT_REFRESH_SECRET: Joi.string().required(),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('90d'),
    STORAGE_PROVIDER: Joi.string().valid('s3', 'alioss', 'tencentoss').default('alioss'),
    STORAGE_BUCKET: Joi.string().default('my-bucket'),
    STORAGE_REGION: Joi.string().required(),
    STORAGE_ENDPOINT: Joi.string().required(),
    STORAGE_ACCESS_KEY_ID: Joi.string().required(),
    STORAGE_ACCESS_KEY_SECRET: Joi.string().required(),
    STORAGE_BASE_URL: Joi.string().optional(),
    STORAGE_MAX_FILE_SIZE: Joi.number().default(10485760),
    STORAGE_ALLOWED_MIME_TYPES: Joi.string().default(
      'image/jpeg,image/png,image/gif,application/pdf',
    ),
    STRIPE_SECRET_KEY: Joi.string().optional(),
    STRIPE_PUBLIC_KEY: Joi.string().optional(),
    STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
    STRIPE_API_VERSION: Joi.string().optional(),
    PAYMENT_PROVIDER: Joi.string().valid('stripe', 'alipay', 'wechat_pay').default('stripe'),
    EVENT_STORE_ENABLED: Joi.string().valid('true', 'false').optional(),
    // 生产限流信任链（module-auth-ip-trust）：反代网段 CIDR 逗号列表；未配=BA 安全默认（只信单值 XFF）。
    AUTH_TRUSTED_PROXIES: Joi.string().optional(),
  };
  const betterAuthSchema = {};
  // Datadog 已移除（global-cn-adaptation G1 / D6）；生产 / 非生产环境 schema 一致。
  return Joi.object({
    ...baseSchema,
    ...betterAuthSchema,
  });
};

const configModuleOptions = {
  isGlobal: true,
  envFilePath: '.env',
  load: [
    () => defaultConfig,
    () => (process.env.NODE_ENV === 'production' ? productionConfig : developmentConfig),
  ],
  validationSchema: createSchemaForEnv(process.env.NODE_ENV === 'production'),
  validationOptions: {
    allowUnknown: true,
    abortEarly: false,
  },
};

@Global()
@Module({
  imports: [NestConfigModule.forRoot(configModuleOptions as any)],
  providers: [ConfigService],
  exports: [NestConfigModule, ConfigService],
})
export class ConfigModule {}
