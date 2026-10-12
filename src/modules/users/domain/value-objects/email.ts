/**
 * Email value object.
 * Immutable, self-validating. Preserves the original casing so persisted values
 * stay byte-identical with the previous implementation; equality is case-insensitive.
 * Pure domain — no framework imports.
 */
export class Email {
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = (raw ?? '').trim();
    if (!Email.isValid(value)) {
      throw new Error(`Invalid email address: ${raw}`);
    }
    return new Email(value);
  }

  static isValid(value: string): boolean {
    return Email.PATTERN.test(value);
  }

  equals(other: Email): boolean {
    return other instanceof Email && other.value.toLowerCase() === this.value.toLowerCase();
  }

  // fallow-ignore-next-line unused-class-member -- intentional value-object string coercion
  toString(): string {
    return this.value;
  }
}
