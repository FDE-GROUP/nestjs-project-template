import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TABLE_OWNERSHIP, WRITE_EXCEPTIONS } from './table-ownership';

/**
 * 表所有权纪律守卫测（microservice-readiness 首切片 #1 · 高危防线）。
 *
 * 规则（成文于 `docs/specs/architecture.md` 附录，清单单源在 `table-ownership.ts`）：
 * **写侧严格**——`apps/reference/src/{modules,tenancy}/**` 内任何
 * `insert/update/delete` 的目标表（以 schema 导出名标识）必须属该文件的
 * 本上下文 owned 集，或命中 `WRITE_EXCEPTIONS` 显式例外。
 * 读侧（select/join）不受约束（CQRS read-model 固有跨上下文聚合）。
 *
 * 已知局限（如实声明）：仅识别「直接以 schema 导出名作参数」的写调用；
 * 经变量别名/动态表名的写不在 grep 级覆盖面内（防过度机制化，不引 AST 工具链）。
 */

const SRC_ROOT = join(__dirname, '..');
const SCAN_DIRS = ['modules', 'tenancy'];

/** 文件路径 → 限界上下文：`modules/<ctx>/**` 取 <ctx>；`tenancy/**` 归 `tenants`。 */
function contextOf(relPath: string): string | null {
  const parts = relPath.split(sep);
  if (parts[0] === 'modules' && parts.length > 2) return parts[1];
  if (parts[0] === 'tenancy') return 'tenants';
  return null;
}

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSources(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

const WRITE_CALL = /\.(insert|update|delete)\(\s*([A-Za-z_][A-Za-z0-9_]*)\b/g;

describe('表所有权纪律守卫（写侧严格 · microservice-readiness #1）', () => {
  const violations: string[] = [];
  const usedExceptions = new Set<string>();

  for (const scanDir of SCAN_DIRS) {
    for (const file of collectSources(join(SRC_ROOT, scanDir))) {
      const rel = relative(SRC_ROOT, file).split(sep).join('/');
      const ctx = contextOf(rel);
      if (!ctx) continue;

      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(WRITE_CALL)) {
        const table = match[2];
        const owner = TABLE_OWNERSHIP[table];
        // 未登记标识符（relations 别名、链式中间量等）不参与判定
        if (!owner) continue;
        if (owner === ctx) continue;

        const exception = WRITE_EXCEPTIONS.find((e) => e.file === rel && e.table === table);
        if (exception) {
          usedExceptions.add(`${rel}::${table}`);
          continue;
        }
        violations.push(`${rel}: ${match[1]}(${table}) → owner "${owner}" ≠ context "${ctx}"`);
      }
    }
  }

  it('写操作目标表全部属本上下文 owned 集（或命中显式例外）', () => {
    expect(violations).toEqual([]);
  });

  it('例外清单无暗账：每条例外都被实际写面消费（防陈旧豁免）', () => {
    for (const e of WRITE_EXCEPTIONS) {
      expect(usedExceptions.has(`${e.file}::${e.table}`)).toBe(true);
    }
  });

  it('owned 集覆盖 schema 全部业务表导出名（防新表漏登记）', () => {
    // 与 schema.ts 顶层 pgTable 导出对齐；relations/enum 不参与。
    const schemaSource = readFileSync(join(SRC_ROOT, 'database/schema.ts'), 'utf8');
    const tableExports = [...schemaSource.matchAll(/export const (\w+) = pgTable\(/g)].map(
      (m) => m[1],
    );
    for (const table of tableExports) {
      expect(TABLE_OWNERSHIP[table], `表 ${table} 未登记 owned 集`).toBeDefined();
    }
  });
});
