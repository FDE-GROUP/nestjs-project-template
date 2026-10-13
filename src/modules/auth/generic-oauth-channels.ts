import type { GenericOAuthConfig } from 'better-auth/plugins';

/**
 * 境内登录渠道 · Better Auth `genericOAuth` 配置构建（FR-3 · 方案 C · A1）。
 *
 * 「邮箱为体、社交为用」：境内渠道**不独立建号**（`disableSignUp: true`），
 * 仅作为既有 email user 的登录 / 绑定方式；各渠道以不可变主体键 `accountSubject`
 * 落一条 `account` 关联到同一 user（复用现有 `account` 表，无需 schema 变更）。
 *
 * D8 交付排序：**本期仅飞书提供构建器**；`wechat` / `dingtalk` / `wecom` 为**接口位**
 * （登记于 `KNOWN_GENERIC_CHANNELS`，未落地构建器即被 `buildGenericOAuthConfigs` 跳过，
 * NFR-1 可插拔 / NFR-2 未配即降级）。端点/字段依飞书开放平台官方文档核验（plan §11-4）。
 */

export type GenericChannelId = 'feishu' | 'wechat' | 'dingtalk' | 'wecom';

/** 已知境内渠道（接口位登记；实际是否可用取决于是否提供构建器 + 凭证）。 */
export const KNOWN_GENERIC_CHANNELS: readonly GenericChannelId[] = [
  'feishu',
  'wechat',
  'dingtalk',
  'wecom',
];

interface ChannelSecrets {
  clientId: string;
  clientSecret: string;
}

// —— 飞书 / Lark 端点（官方文档核验，2026-10-13）——
const FEISHU_AUTHORIZE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token';
const FEISHU_USERINFO_URL = 'https://open.feishu.cn/open-apis/authen/v1/user_info';
// 基础用户信息 scope；不含 email（方案 C 下 email 源自注册账号，非渠道返回）。
const FEISHU_SCOPES = ['contact:user.base:readonly'];

function buildFeishu(secrets: ChannelSecrets): GenericOAuthConfig {
  return {
    providerId: 'feishu',
    authorizationUrl: FEISHU_AUTHORIZE_URL,
    tokenUrl: FEISHU_TOKEN_URL,
    userInfoUrl: FEISHU_USERINFO_URL,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
    scopes: FEISHU_SCOPES,
    // 飞书 v2 token 端点为 JSON body、client_secret 入 body（非 form、非 Basic）→ 自定义换取。
    getToken: async ({ code, redirectURI }) => {
      const res = await fetch(FEISHU_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: secrets.clientId,
          client_secret: secrets.clientSecret,
          code,
          redirect_uri: redirectURI,
        }),
      });
      const data = (await res.json()) as Record<string, any>;
      if (data.code !== 0 || !data.access_token) {
        throw new Error(`Feishu token exchange failed: code=${data.code} ${data.error ?? ''}`);
      }
      return {
        accessToken: data.access_token as string,
        refreshToken: data.refresh_token as string | undefined,
        tokenType: (data.token_type as string) ?? 'Bearer',
        accessTokenExpiresAt: data.expires_in
          ? new Date(Date.now() + Number(data.expires_in) * 1000)
          : undefined,
        refreshTokenExpiresAt: data.refresh_token_expires_in
          ? new Date(Date.now() + Number(data.refresh_token_expires_in) * 1000)
          : undefined,
        scopes: typeof data.scope === 'string' ? (data.scope as string).split(' ') : undefined,
        raw: data,
      };
    },
    // 飞书 userinfo 响应体嵌套在 `data` 下、以 Bearer user_access_token 获取 → 自定义解包。
    getUserInfo: async (tokens) => {
      const res = await fetch(FEISHU_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: 'application/json' },
      });
      const body = (await res.json()) as Record<string, any>;
      if (body.code !== 0 || !body.data) {
        throw new Error(`Feishu userinfo fetch failed: code=${body.code} ${body.msg ?? ''}`);
      }
      // 解包 data 并补 GenericOAuthUserInfo 必填的 emailVerified（渠道不报验证态）。
      return { ...body.data, emailVerified: false };
    },
    // 不可变主体键：优先 union_id（跨应用稳定），回退 open_id。Better Auth 运行期不改写字段。
    accountSubject: ({ profile }) =>
      String(profile.union_id ?? profile.open_id ?? profile.user_id ?? ''),
    mapProfileToUser: (profile) => ({
      name: (profile.name as string) ?? undefined,
      email: (profile.email as string) ?? null,
      image: (profile.avatar_thumb as string) ?? (profile.avatar_url as string) ?? undefined,
      emailVerified: false,
    }),
    // 方案 C：社交渠道不独立建号——首登无匹配账号即拒绝，须先以 email 登录后绑定。
    disableSignUp: true,
    // 飞书授权码流程不支持标准 PKCE；显式关闭。
    pkce: false,
  };
}

/** 渠道构建器登记表；未列入者（wechat/dingtalk/wecom）视为暂缓的接口位。 */
const CHANNEL_BUILDERS: Partial<
  Record<GenericChannelId, (s: ChannelSecrets) => GenericOAuthConfig>
> = {
  feishu: buildFeishu,
  // wechat: 待补（getToken 走 GET、errcode 判定、mapProfile、accountSubject=unionid）
  // dingtalk: 待补（token POST JSON、userinfo 自定义头、accountSubject=unionId）
  // wecom: 待补（服务端 corp access_token 换取编排，难度最高）
};

/**
 * 依启用列表 + 凭证装配 `genericOAuth` 配置数组。
 * 跳过条件（NFR-2 未配即降级）：渠道未提供构建器、或缺 clientId/clientSecret。
 */
export function buildGenericOAuthConfigs(
  genericProviders: readonly string[],
  secrets: Record<string, Record<string, string>>,
): GenericOAuthConfig[] {
  const configs: GenericOAuthConfig[] = [];
  for (const rawId of genericProviders) {
    const id = rawId as GenericChannelId;
    const builder = CHANNEL_BUILDERS[id];
    if (!builder) continue; // 接口位但未实现 → 跳过
    const secret = secrets[id];
    if (!secret?.clientId || !secret?.clientSecret) continue; // 未配凭证 → 降级
    configs.push(builder({ clientId: secret.clientId, clientSecret: secret.clientSecret }));
  }
  return configs;
}
