import { defineEntity, p } from '@mikro-orm/core';
import { MIKRO_ENTITIES } from './entities';
import { MIKRO_FOUR_TABLE_ENTITIES } from './four-tables';

/**
 * ORM 修宪案 B · 切片 2 —— posts 参考上下文试迁移的 **零装饰器** MikroORM v7 实体（expand 双轨）。
 *
 * 放置口径（有意为之）：本文件与 `database/mikro/entities.ts`（BA 表面）/ `database/schema.ts`（Drizzle 中心表
 * 定义）同级——「物理表 → 实体」的映射属**基础设施/schema 层**，非领域模型（posts 领域是贫血的·port 只返
 * `PostRecord` 裸行）。沿现仓惯例：`schema.ts` 中心定义所有表（含 `post`），`DrizzlePostRepository` 从
 * `@app/database/schema` 引 `post`；本切片对称地从 `@app/database/mikro/post.entity` 引 `Post`。
 *
 * 列名走 `EntityCaseNamingStrategy`（见 orm.ts）：属性名**原样**作列名（camelCase 列·SQL 双引号限定），与
 * `schema.ts` 里 `post` 表的物理列（`id/title/content/published/organizationId/workspaceId/createdAt/updatedAt`
 * 均 camelCase）**逐列对齐**，故两侧读写键名一致、无需 snake↔camel 往返。
 *
 * 跨模型外键（`organizationId`→organization、`workspaceId`→workspace）当**普通 string 列**存（不建 Mikro 关系
 * 对象）——与 BA 表面实体同构；DB 侧 FK 约束（cascade / set null）仍由物理表强制，本实体不参与关系装配。
 * `updatedAt` 在 Drizzle 侧靠 app 级 `$onUpdate` 维护（无 DB 触发器），故写路径（仓储）显式盖时间戳。
 */
/**
 * 实例类型（companion interface·与下方 `const Post` 声明合并）：MikroORM v7 unchained 下 `defineEntity` 只产
 * 运行时实体描述·TS 实例形状须由同名 `interface` 提供（v7 文档标准写法）——供仓储侧 `FilterQuery<Post>` /
 * `entity: Post` 寻址。字段与物理列一一对应·`datetime`⇄`Date`·`nullable`⇄`| null`。
 */
export interface Post {
  id: string;
  title: string;
  // nullable 列：Mikro 推断实体实例为 `T | null | undefined`（未刷新时可缺）·故取可选以对齐 `em` 返回值；
  // 仓储 `toRecord` 统一 `?? null` 归一为 port 的 `PostRecord`（`content`/`workspaceId` 恒为值或 null）。
  content?: string | null;
  published: boolean;
  organizationId: string;
  workspaceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const Post = defineEntity({
  name: 'Post',
  tableName: 'post',
  properties: {
    id: p.string().primary(),
    title: p.string(),
    content: p.string().nullable(),
    published: p.boolean().default(false),
    organizationId: p.string(),
    workspaceId: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
});

/**
 * app-Mikro 实例承载的实体集（单一连接池）。
 * 切片 2：仅 `Post`（posts 试迁移·与 BA 面解耦）。
 * 切片 3b（ORM 修宪案 B）：BA 接链单点切换后，BA 七表（`MIKRO_ENTITIES`）并入**同一** app-orm。
 * 切片 3c-ii（γ）：四表运行时扁平实体（`MIKRO_FOUR_TABLE_ENTITIES`·workspace/user_status/
 * tenant_subscription/event·由 `four-tables.ts` 单一列元数据源派生）并入——与 BA 七表/Post **表集互斥无交叉**
 * （不同物理表）→无 `MikroORM.init` 注册冲突；忠实迁移实体（`migration/migration-entities.ts`）**同源**（均读
 * `four-tables.ts` 元数据·双描述消除）但仍独立装进迁移 init。懒建语义不变→`app-boot.smoke`仍 DB-free。
 */
export const MIKRO_APP_ENTITIES = [Post, ...MIKRO_ENTITIES, ...MIKRO_FOUR_TABLE_ENTITIES];
