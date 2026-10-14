export const AuthInstanceInjectKey = Symbol('AuthInstance');

export enum OAuthProviderType {
  GITHUB = 'github',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  TWITTER = 'twitter',
  MICROSOFT = 'microsoft',
  DISCORD = 'discord',
  APPLE = 'apple',
  LINKEDIN = 'linkedin',
  GITLAB = 'gitlab',
  SPOTIFY = 'spotify',
  TWITCH = 'twitch',
  REDDIT = 'reddit',
  DROPBOX = 'dropbox',
  TIKTOK = 'tiktok',
  KICK = 'kick',
  ROBLOX = 'roblox',
  VK = 'vk',
}

// 会话旁路路径表（module-auth-http-surface·丙清算）：原 AuthMiddleware 消费面已随接线退役，
// 现唯一消费方 = AuthSessionReader 廉价旁路（免无意义会话查询）。
export const AUTH_BYPASS_PATHS = [
  // 存活探针（module-common-health-probe）：与 Dockerfile HEALTHCHECK 的 /api/v1/health 口径对齐
  '/health',
  '/apidoc',
  '/openapi.yaml',
  '/openapi.json',
];
