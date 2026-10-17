/**
 * `@saas/api-client` 汇面（前端 F1 typed 契约消费制品）。
 * 四件：生成类型（schema）· typed client · errors 单源 · envelope 契约。
 */
export * from './client';
export * from './envelope';
export * from './errors';
export type { components, operations, paths } from './schema';
