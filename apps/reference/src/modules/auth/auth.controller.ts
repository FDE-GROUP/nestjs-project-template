import { Public } from '@core/tenancy/public.decorator';
import { Controller, Delete, Get, Inject, Post, Query } from '@nestjs/common';

import { AuthInstanceInjectKey } from './auth.constant';
import type { InjectAuthInstance } from './auth.interface';
import { AuthService } from './auth.service';

/** 认证面自身必须登录前可达（否则取不到会话=鸡生蛋死锁）·S11 显式旁路全局会话墙。 */
@Public()
@Controller('/better-auth')
export class AuthController {
  constructor(
    @Inject(AuthService) readonly _authService: AuthService,
    @Inject(AuthInstanceInjectKey)
    private readonly authInstance: InjectAuthInstance,
  ) {}

  @Get('token')
  getOrVerifyToken(@Query('token') token?: string, @Query('id') id?: string) {
    console.log(token, id);
  }

  @Post('token')
  async generateToken() {}

  @Delete('token')
  deleteToken() {
    return 'OK';
  }

  @Get('session')
  async getSession() {}
  @Get('providers')
  getProviders() {
    return this.authInstance.get().api.getProviders();
  }
}
