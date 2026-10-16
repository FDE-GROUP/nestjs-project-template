import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { MikroOrmService } from './mikro-orm.service';

/**
 * ORM 修宪案 B · 切片 2 —— app-Mikro 装配根（`@Global`·双轨）。
 *
 * 随 `AppModule` 引入即全局提供 `MikroOrmService`，供 posts 仓储就地注入（沿 `DatabaseModule` 之
 * `@Global` + `exports` 端口先例·S10 P1）。构造期不建连（见 `MikroOrmService` 懒建说明）·不劫持
 * DB-free 装配冒烟。切片 4 contract 阶段与 Drizzle 依赖一并收口。
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [MikroOrmService],
  exports: [MikroOrmService],
})
export class MikroOrmModule {}
