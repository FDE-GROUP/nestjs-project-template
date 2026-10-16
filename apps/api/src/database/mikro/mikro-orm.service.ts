import { ConfigService } from '@app/config/config.service';
import type { EntityManager, MikroORM } from '@mikro-orm/core';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { initMikroOrm } from './orm';
import { MIKRO_APP_ENTITIES } from './post.entity';

/**
 * ORM 修宪案 B · 切片 2 —— app 侧 MikroORM v7 连接持有者（**懒建**·双轨）。
 *
 * 刻意不在构造期 / `onModuleInit` 建连：`MikroORM.init()` 会开连接，若 eager 则劫持 `app-boot.smoke`
 * （DB-free 整树装配冒烟）与 `verify:prod-boot`（只打 /health·不碰 posts）。故首次**真正用到** posts
 * 数据面时才 `ensure()` 懒 init（本仓默认 CI 不跑真 posts 读写→永不触发·保持 DB-free 不变量）；
 * env-gated 全栈 e2e 打 `/posts` 时才真连。`onModuleDestroy` 仅在曾建过连时 close。
 *
 * 实体集＝`MIKRO_APP_ENTITIES`（本切片仅 `Post`）：与 BA 表面（切片 1·仍走 Drizzle）解耦·切片 3 换接链再并入。
 * 每次读写经 `fork()` 取**独立 em**（禁共享全局 `orm.em`·V4 串租户教训·与切片 1 adapter 同纪律）。
 */
@Injectable()
export class MikroOrmService implements OnModuleDestroy {
  private readonly logger = new Logger(MikroOrmService.name);
  private orm?: MikroORM;
  private pending?: Promise<MikroORM>;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private async ensure(): Promise<MikroORM> {
    if (!this.pending) {
      const url = this.config.getDatabaseConfig().url;
      this.pending = initMikroOrm(url, MIKRO_APP_ENTITIES).then((orm) => {
        this.orm = orm;
        this.logger.log('MikroORM (posts trial slice) connected');
        return orm;
      });
    }
    return this.pending;
  }

  /** per-operation fork（读写各取独立 em·绝不共享全局 `orm.em`）。 */
  async fork(): Promise<EntityManager> {
    const orm = await this.ensure();
    return orm.em.fork();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.orm) {
      await this.orm.close();
      this.logger.log('MikroORM (posts trial slice) disconnected');
    }
  }
}
