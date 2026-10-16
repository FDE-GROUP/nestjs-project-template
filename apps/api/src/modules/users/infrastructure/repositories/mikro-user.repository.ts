import { User as UserEntity } from '@app/database/mikro/entities';
import { MikroOrmService } from '@app/database/mikro/mikro-orm.service';
import type { InferEntity } from '@mikro-orm/core';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { User, type UserState } from '../../domain/entities/user.aggregate';
import type { UserRepository } from '../../domain/repositories/user.repository';

/**
 * 运行时 Mikro `User` 实体 → 领域 `UserState`（与 `user.mapper.rowToState` 同逻辑·仅入参换形）。
 * 刻意不复用 Drizzle 行版 `rowToState`（其类型系 `typeof user.$inferSelect`·与 Mikro 实体实例形状不符）；
 * 语义逐字段镜像：可空列 `?? null`、`password`→`passwordHash`（缺省 ''）、`updatedAt` 兜底 `createdAt`
 * （真实列 NOT NULL·Mikro 侧仅测试面声明可空·运行期不触发兜底）。
 */
function entityToState(entity: InferEntity<typeof UserEntity>): UserState {
  return {
    id: entity.id,
    email: entity.email,
    firstName: entity.firstName ?? null,
    lastName: entity.lastName ?? null,
    role: (entity.role ?? 'USER') as UserState['role'],
    passwordHash: entity.password ?? '',
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt ?? entity.createdAt,
  };
}

/**
 * ORM 修宪案 B · 切片 3d（S-d1）—— `UserRepository` 端口的 **MikroORM 适配**（expand 双轨·与
 * `DrizzleUserRepository` 并存·`USER_REPOSITORY` 绑定改指本类·旧类不删作回滚点）。
 *
 * 读写全走 Mikro `EntityManager`（`findOne`/`create`+`persist`+`flush`/`assign`+`flush`/`nativeDelete`）·
 * 每次 `fork()` 取独立 em（禁共享全局 em·V4 串租户教训）。`EntityCaseNamingStrategy` 使 camelCase 属性⇄
 * camelCase 物理列（对齐 `schema.ts` 的 `user` 表·见 `entities.ts` 头注）·`datetime` 回真实 `Date`。
 *
 * 时间戳保真（镜像 Drizzle `returning(returnFields)` 的「DB-authoritative 时间戳回读」语义）：新建显式盖
 * `createdAt/updatedAt`（无 DB 触发器·Drizzle 侧靠 app `$onUpdate`），更新经 `assign` 后从实体读回
 * `createdAt`（原值保留）+ `updatedAt`（新盖）。`attachPersistenceMetadata` 落回聚合。
 *
 * `user` 属 `users` 上下文（表所有权单源）·本类写自身 owned 表 → 写侧纪律天然合规。`role` 列系切片 3d
 * 补入运行时 `User` 实体（见 `entities.ts`）。
 */
@Injectable()
export class MikroUserRepository implements UserRepository {
  private readonly logger = new Logger(MikroUserRepository.name);

  constructor(@Inject(MikroOrmService) private readonly mikro: MikroOrmService) {}

  async findById(id: string): Promise<User | null> {
    const em = await this.mikro.fork();
    const entity = await em.findOne(UserEntity, { id } as never);
    return entity ? User.rehydrate(entityToState(entity)) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const em = await this.mikro.fork();
    const entity = await em.findOne(UserEntity, { email } as never);
    return entity ? User.rehydrate(entityToState(entity)) : null;
  }

  async save(u: User): Promise<User> {
    const em = await this.mikro.fork();
    if (u.isNew) {
      const now = new Date();
      const entity = em.create(UserEntity, {
        id: u.id,
        name: u.fullName,
        email: u.email,
        emailVerified: false,
        password: u.passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        createdAt: now,
        updatedAt: now,
      } as never);
      await em.persist(entity).flush();
      // 新建时间戳即为显式写入的 `now`（无 DB 触发器）·`em.create(… as never)` 将实体实例列宽化为可空
      // → 直接回传已知的 `now`（与写入值恒等·忠实 DB-authoritative 语义）。
      u.attachPersistenceMetadata(now, now);
      u.markExisting();
      this.logger.log(`Inserted user ${u.id}`);
      return u;
    }

    const entity = await em.findOne(UserEntity, { id: u.id } as never);
    if (!entity) {
      // 镜像 Drizzle `update…returning` 对缺失行取回 undefined→下游崩溃的语义：显式 fail-loud，不静默新建。
      throw new Error(`MikroUserRepository.save: user ${u.id} not found for update`);
    }
    const now = new Date();
    em.assign(entity, {
      name: u.fullName,
      email: u.email,
      password: u.passwordHash,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      updatedAt: now,
    } as never);
    await em.flush();
    // `createdAt` 取回实体原值（真实列 NOT NULL·`?? now` 仅类型层兜底·运行期不触发）；`updatedAt` 为刚盖的新值。
    u.attachPersistenceMetadata(entity.createdAt ?? now, entity.updatedAt ?? now);
    return u;
  }

  async remove(id: string): Promise<void> {
    const em = await this.mikro.fork();
    await em.nativeDelete(UserEntity, { id } as never);
  }
}
