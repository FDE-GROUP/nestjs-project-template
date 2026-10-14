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

// Auth middleware configuration
// Paths relative to the basePath that should bypass authentication
export const AUTH_BYPASS_PATHS = [
  '/better-auth/token',
  '/better-auth/session',
  '/better-auth/providers',
  // 存活探针（module-common-health-probe）：与 Dockerfile HEALTHCHECK 的 /api/v1/health 口径对齐
  //（旧死字样 '/healthcheck' 无任何实现，已清）；auth middleware 与会话读取器共用此表。
  '/health',
  '/apidoc',
  '/openapi.yaml',
  '/openapi.json',
];
export const AUTH_ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
