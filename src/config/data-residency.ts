/**
 * PIPL data-residency startup guard (C2 · FR-7 / D7).
 *
 * Vision: PostgreSQL + object storage must reside in mainland China regions.
 * Not applied to Stripe / overseas OAuth — those are cross-border API calls,
 * not personal-data *storage*, and fall outside the residency mandate.
 *
 * Failure mode is decided by the caller:
 *   - strict: violations collected as `errors[]` (bootstrap exits).
 *   - warn:   violations collected as `warnings[]` (bootstrap continues).
 *
 * Pure module — no Nest DI, no side effects — so it is unit-testable in isolation.
 */

export type ResidencyMode = 'strict' | 'warn';

export interface DataResidencyInput {
  databaseUrl: string;
  storage: {
    provider?: string;
    region?: string;
    endpoint?: string;
    accessKeyId?: string;
  };
}

export interface ResidencyReport {
  errors: string[];
  warnings: string[];
}

/**
 * Host patterns considered "inside the mainland boundary" for the DB endpoint.
 * Includes loopback / RFC1918 private ranges (dev + VPC), `.cn` TLDs,
 * Aliyun regional (`*.cn-<region>.aliyuncs.com` / `*.rds.aliyuncs.com`)
 * and Tencent Cloud (`*.myqcloud.com` / `*.tencentcloudapi.com`).
 */
const MAINLAND_DB_HOST_PATTERNS: RegExp[] = [
  /^localhost$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /\.cn$/i,
  /\.cn-[a-z0-9-]+\.aliyuncs\.com$/i,
  /\.rds\.aliyuncs\.com$/i,
  /\.myqcloud\.com$/i,
  /\.tencentcloudapi\.com$/i,
];

/** Per-provider allowlist of mainland region identifiers. */
const MAINLAND_STORAGE_REGIONS: Record<string, RegExp> = {
  alioss: /^oss-cn-[a-z0-9-]+$/i,
  tencentoss: /^ap-(guangzhou|shanghai|beijing|chengdu|chongqing|nanjing|shenyang|wuhan)$/i,
  s3: /^cn-(north-1|northwest-1)$/i,
};

export function extractDbHost(databaseUrl: string): string | null {
  try {
    const u = new URL(databaseUrl);
    return u.hostname || null;
  } catch {
    return null;
  }
}

export function isMainlandDbHost(host: string, extraAllowlist: string[] = []): boolean {
  if (extraAllowlist.includes(host)) return true;
  return MAINLAND_DB_HOST_PATTERNS.some((re) => re.test(host));
}

export function isMainlandStorageRegion(provider: string, region: string): boolean {
  const re = MAINLAND_STORAGE_REGIONS[provider];
  if (!re) return false;
  return re.test(region);
}

/**
 * Collects residency violations. Callers pick the mode; the module itself is
 * agnostic to whether the outcome blocks boot.
 */
export function assertDataResidency(
  input: DataResidencyInput,
  mode: ResidencyMode,
  extraDbHostAllowlist: string[] = [],
): ResidencyReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const push = (msg: string) => (mode === 'strict' ? errors.push(msg) : warnings.push(msg));

  // 1. Database host
  const dbHost = extractDbHost(input.databaseUrl);
  if (!dbHost) {
    push(`DATABASE_URL unparseable: "${input.databaseUrl}"`);
  } else if (!isMainlandDbHost(dbHost, extraDbHostAllowlist)) {
    push(`DATABASE_URL host "${dbHost}" is outside mainland allowlist`);
  }

  // 2. Storage region — skip when provider not configured (NFR-2 degrade)
  const { storage } = input;
  const storageConfigured = Boolean(storage.provider && storage.accessKeyId);
  if (storageConfigured && storage.provider && storage.region) {
    if (!isMainlandStorageRegion(storage.provider, storage.region)) {
      push(
        `storage region "${storage.region}" for provider "${storage.provider}" is outside mainland allowlist`,
      );
    }
  }

  return { errors, warnings };
}

/**
 * Resolves the effective enforce flag from env, defaulting to production-only.
 * Returns `true` for strict (hard-fail on violation), `false` for warn.
 */
export function resolveEnforceMode(
  nodeEnv: string | undefined,
  override: string | undefined,
): ResidencyMode {
  if (override === 'true') return 'strict';
  if (override === 'false') return 'warn';
  return nodeEnv === 'production' ? 'strict' : 'warn';
}
