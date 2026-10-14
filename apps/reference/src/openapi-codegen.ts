import * as dotenv from 'dotenv';

dotenv.config();

import { mkdirSync, writeFileSync } from 'node:fs';
import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as yaml from 'js-yaml';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';

/**
 * OpenAPI codegen 入口（microservice-readiness 首切片 #4）。
 *
 * **DB-free**：只 `create` 不 `listen`——`onModuleInit`（DrizzleService 的 `SELECT 1`）
 * 仅在 init/listen 时触发，故本脚本无数据库也能直出 spec，替代原先
 * 「起 7009 服务 + sleep 15 + curl /openapi.yaml」的间接路径。
 *
 * 产物与运行服务导出语义一致：复刻 main.ts 的 prefix/versioning/DocumentBuilder
 * 配置（改 swagger 装配时两处须同步，本文件与 main.ts 互为镜像）。
 */
async function generate() {
  const logger = new Logger('OpenApiCodegen');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  try {
    const configService = app.get(ConfigService);
    const appConfig = configService.getAppConfig();
    const swaggerConfig = configService.getSwaggerConfig();

    // 与 main.ts 一致：文档 paths 依赖全局前缀与版本化配置，须在 createDocument 前设置
    app.setGlobalPrefix(appConfig.apiPrefix as string, {
      exclude: swaggerConfig?.path
        ? [swaggerConfig.path, 'openapi.json', 'openapi.yaml']
        : ['openapi.json', 'openapi.yaml'],
    });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    const apiDocVersion = process.env.API_DOC_VERSION || swaggerConfig?.version || '1.0.0';
    const options = new DocumentBuilder()
      .setOpenAPIVersion(swaggerConfig?.openApiVersion || '3.1.0')
      .setTitle(swaggerConfig?.title || 'API Documentation')
      .setDescription(swaggerConfig?.description || 'API Documentation Description')
      .addBearerAuth()
      .setVersion(apiDocVersion)
      .build();

    const document = SwaggerModule.createDocument(app, options);
    mkdirSync('openapi', { recursive: true });
    writeFileSync('openapi/openapi.yaml', yaml.dump(document));
    logger.log(
      `OpenAPI spec exported to openapi/openapi.yaml (${Object.keys(document.paths ?? {}).length} paths)`,
    );
  } finally {
    await app.close();
  }
}

generate().catch((err) => {
  new Logger('OpenApiCodegen').error(`Failed to generate OpenAPI spec: ${err.message}`, err.stack);
  process.exit(1);
});
