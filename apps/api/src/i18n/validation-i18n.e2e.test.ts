import 'reflect-metadata';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IsEmail, IsNotEmpty } from 'class-validator';
import { I18nValidationPipe } from 'nestjs-i18n';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommonModule } from '../common/common.module';
import { AppI18nModule } from './i18n.module';

// 本地 probe DTO：自 module-users-surface-reduction（Users 面收紧删 CreateUserDto）起，
// 本契约测不再寄居生产 DTO——显式 validate.* 键即被测面本身（翻译链 + S9 paramtypes 锁）。
class ProbeDto {
  @IsEmail({}, { message: 'validate.email.invalid' })
  @IsNotEmpty({ message: 'validate.email.required' })
  readonly email: string;
}

@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() dto: ProbeDto) {
    return { ok: true, email: dto.email };
  }
}

@Module({
  imports: [AppI18nModule, CommonModule],
  controllers: [ProbeController],
})
class ProbeModule {}

// Contract test for L1 stage B: validation messages are localized via nestjs-i18n while
// the HTTP error response keeps the project's existing shape
// (statusCode / message / error / timestamp / path). Also locks the APP_FILTER precedence
// (i18n validation filter must win over the catch-all HttpExceptionFilter).
describe('Validation i18n localization (contract)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new I18nValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (lang?: string) =>
    app.inject({
      method: 'POST',
      url: '/probe',
      payload: { email: 'not-an-email' },
      headers: lang ? { 'accept-language': lang } : {},
    });

  it('keeps ProbeDto in design:paramtypes so @Body validation runs', () => {
    // Guards the SWC/`import type` erasure pitfall: without the value import the global
    // pipe sees no metatype and silently skips validation (would return 2xx).
    const paramTypes = Reflect.getMetadata(
      'design:paramtypes',
      ProbeController.prototype,
      'create',
    ) as unknown[];
    expect(paramTypes[0]).toBe(ProbeDto);
  });

  it('localizes to zh and preserves the response contract', async () => {
    const res = await post('zh');
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.statusCode).toBe(400);
    expect(body.message).toContain('请输入正确的邮箱');
    expect(body.error).toBe('Bad Request');
    // Shape preserved: timestamp + path present (proves the custom formatter ran,
    // not the raw nestjs-i18n default body and not the untranslated-key passthrough).
    expect(typeof body.timestamp).toBe('string');
    expect(body.path).toBe('/probe');
    // requestId 契约同步锁：本装配不经 main.ts hook，故走兜底链第二级（Fastify 原生 request.id）
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId.length).toBeGreaterThan(0);
    // 不为校验失败预填 errorCode（裁决点丙）
    expect('errorCode' in body).toBe(false);
  });

  it('localizes to en via accept-language', async () => {
    const body = JSON.parse((await post('en')).body);
    expect(body.message).toContain('Please enter a valid email address');
  });

  it('falls back to zh when no accept-language header is sent', async () => {
    const body = JSON.parse((await post()).body);
    expect(body.message).toContain('请输入正确的邮箱');
  });
});
