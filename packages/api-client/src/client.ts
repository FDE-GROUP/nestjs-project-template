import type { ClientOptions } from 'openapi-fetch';
import createClient from 'openapi-fetch';
import type { paths } from './schema';

/**
 * typed 客户端工厂（前端 F1 · module-frontend-api-client §2.2.2）。
 *
 * **缺省 baseUrl 为空**：openapi.yaml 的 paths 已含全局前缀 + 版本（`/api/v1/…`），
 * 若再设 basePath `/api/v1` 会双前缀——留空即浏览器下按同源相对路径解析（apps/web 零绝对 URL）。
 * `credentials: 'same-origin'` 缺省携带 cookie；`fetch` 可注入（测试/自定义传输）。
 * 类型全从 `openapi/openapi.yaml`（SSOT）生成的 `paths` 派生。
 */
export const DEFAULT_BASE_PATH = '';

export interface ApiClientOptions {
  /** 绝对基址（Node/测试用）；同源反代下缺省空串（paths 已带 /api/v1 前缀）。 */
  baseUrl?: string;
  /** 注入 fetch（缺省 globalThis.fetch）。 */
  fetch?: ClientOptions['fetch'];
}

export function createApiClient(options: ApiClientOptions = {}) {
  return createClient<paths>({
    baseUrl: options.baseUrl ?? DEFAULT_BASE_PATH,
    credentials: 'same-origin',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { paths };
