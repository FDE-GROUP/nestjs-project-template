import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuid-v7';

/**
 * UUIDv7 契约测（RFC 9562 §4.2.3 · module-es-first-real-consumer 附带机制统一·人裁 2026-10-17）：
 * 锁三件事——version/variant 位正确、高 48bit 时间戳可读、字节序≈时间序（这是选它的全部理由）。
 */
describe('uuidv7（RFC 9562 v7 布局）', () => {
  it('形态：8-4-4-4-12·version nibble=7·variant=10xx', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('高 48bit 时间戳：编码值 ≈ 生成时刻（毫秒级）', () => {
    const before = Date.now();
    const id = uuidv7();
    const after = Date.now();
    const hex = id.replace(/-/g, '').slice(0, 12); // 前 6 字节 = 48bit ms
    const ms = Number.parseInt(hex, 16);
    expect(ms).toBeGreaterThanOrEqual(before);
    expect(ms).toBeLessThanOrEqual(after);
  });

  it('字节序≈时间序：后生成的 id 字典序不早于先生成的（时间戳高位承诺）', () => {
    const first = uuidv7();
    // 跨至少 2ms 保证时间戳位推进（同毫秒内随机位不保序·非本测承诺面）
    const spinStart = Date.now();
    while (Date.now() - spinStart < 2) {
      // busy wait
    }
    const second = uuidv7();
    expect(second > first).toBe(true);
  });

  it('唯一性：千连发零重复', () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(uuidv7());
    }
    expect(set.size).toBe(1000);
  });
});
