import { Module } from '@nestjs/common';
// S9 铁律：TerminusModule 为 imports 装配值，必须值导入
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * 存活探针模块（module-common-health-probe）：TerminusModule 提供 HealthCheckService
 * 标准 liveness/readiness 机器；本切片仅挂 liveness（ping-only），零外部依赖触达，
 * boot 冒烟 compile 整树即覆盖其 DI 可解析（CI DB-free 不变量不动）。
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
