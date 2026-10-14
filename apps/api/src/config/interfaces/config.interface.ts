export interface AppConfig {
  name: string;
  description: string;
  version: string;
  port: number;
  host: string;
  apiPrefix: string;
}

export interface AuthConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
}

export interface CorsConfig {
  enabled: boolean;
  origin: string | string[];
  credentials: boolean;
  methods: string[];
}

export interface SwaggerConfig {
  enabled: boolean;
  title: string;
  description: string;
  version: string;
  path: string;
  openApiVersion: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface StorageConfig {
  provider: 's3' | 'alioss' | 'tencentoss';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId: string;
  accessKeySecret: string;
  baseUrl?: string;
  maxFileSize: number; // use bytes
  allowedMimeTypes: string[];
}

export interface StripeConfig {
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  apiVersion: string;
}

export interface PaymentConfig {
  /** 选定的默认支付通道；未配即降级（PaymentService 使用时才报错） */
  provider: 'stripe' | 'alipay' | 'wechat_pay';
}

export interface OAuthConfig {
  providers: Array<{
    type: string;
    enabled: boolean;
  }>;
  /** 境内 genericOAuth 渠道 providerId 列表（如 'feishu'）；与标准 socialProviders 分说。 */
  genericProviders: string[];
  baseConfig: {
    callbackUrl: string;
    cookieName: string;
    cookieMaxAge: number;
    cookieSecure: boolean;
  };
  secrets: Record<string, Record<string, string>>;
}

export interface PlatformConfig {
  /** 全局唯一平台经营者 email（FR-13 · S5）；平台级守卫唯一判据。 */
  operatorEmail: string;
}

export interface Config {
  app: AppConfig;
  auth: AuthConfig;
  cors: CorsConfig;
  swagger: SwaggerConfig;
  database: DatabaseConfig;
  storage: StorageConfig;
  stripe: StripeConfig;
  payment: PaymentConfig;
  platform: PlatformConfig;
  oauth: OAuthConfig;
  eventStore: EventStoreConfig;
}

/** ES 首切片（module-users-es-append §2.5）：event store 影子追加双模开关。 */
export interface EventStoreConfig {
  enabled: boolean;
}
