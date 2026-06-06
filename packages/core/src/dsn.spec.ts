import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { parseDsn, DsnMalformedError, type DsnEnvironment } from './dsn.js';

const HEX64 = 'a'.repeat(64);
const HEX64_B = '0123456789abcdef'.repeat(4);

describe('parseDsn', () => {
  it('parses a valid live DSN', () => {
    const dsn = `nmk_live_${HEX64}`;
    expect(parseDsn(dsn)).toEqual({
      publicKey: HEX64,
      environment: 'live',
    });
  });

  it('parses a valid staging DSN', () => {
    const dsn = `nmk_staging_${HEX64_B}`;
    expect(parseDsn(dsn)).toEqual({
      publicKey: HEX64_B,
      environment: 'staging',
    });
  });

  it('parses a valid dev DSN', () => {
    const dsn = `nmk_dev_${HEX64}`;
    expect(parseDsn(dsn)).toEqual({
      publicKey: HEX64,
      environment: 'dev',
    });
  });

  it('parses a raw 64-char hex key with null environment', () => {
    expect(parseDsn(HEX64_B)).toEqual({
      publicKey: HEX64_B,
      environment: null,
    });
  });

  it('trims surrounding whitespace', () => {
    const dsn = `  \tnmk_live_${HEX64}\n `;
    expect(parseDsn(dsn)).toEqual({
      publicKey: HEX64,
      environment: 'live',
    });
  });

  it('rejects mixed-case hex in prefixed DSN', () => {
    const mixed = 'A' + HEX64.slice(1);
    const dsn = `nmk_live_${mixed}`;
    expect(() => parseDsn(dsn)).toThrow(DsnMalformedError);
    try {
      parseDsn(dsn);
    } catch (err) {
      expect(err).toBeInstanceOf(DsnMalformedError);
      const e = err as DsnMalformedError;
      expect(e.code).toBe('DSN_MALFORMED');
      expect(e.input).toBe(dsn);
    }
  });

  it('rejects mixed-case hex in raw key', () => {
    const mixed = 'ABCDEF' + HEX64.slice(6);
    expect(() => parseDsn(mixed)).toThrow(DsnMalformedError);
  });

  it('rejects a too-short hex key', () => {
    const short = 'a'.repeat(63);
    expect(() => parseDsn(short)).toThrow(DsnMalformedError);
    expect(() => parseDsn(`nmk_live_${short}`)).toThrow(DsnMalformedError);
  });

  it('rejects a too-long hex key', () => {
    const long = 'a'.repeat(65);
    expect(() => parseDsn(long)).toThrow(DsnMalformedError);
    expect(() => parseDsn(`nmk_live_${long}`)).toThrow(DsnMalformedError);
  });

  it('rejects non-hex characters', () => {
    const nonHex = 'g'.repeat(64);
    expect(() => parseDsn(nonHex)).toThrow(DsnMalformedError);
    expect(() => parseDsn(`nmk_live_${nonHex}`)).toThrow(DsnMalformedError);
  });

  it('rejects an empty string', () => {
    expect(() => parseDsn('')).toThrow(DsnMalformedError);
    expect(() => parseDsn('   \t\n')).toThrow(DsnMalformedError);
  });

  it('rejects an unknown environment prefix', () => {
    expect(() => parseDsn(`nmk_prod_${HEX64}`)).toThrow(DsnMalformedError);
    expect(() => parseDsn(`nmk_LIVE_${HEX64}`)).toThrow(DsnMalformedError);
    expect(() => parseDsn(`nmk__${HEX64}`)).toThrow(DsnMalformedError);
  });

  it('preserves original input on the thrown error', () => {
    const original = '  nope  ';
    try {
      parseDsn(original);
      expect.fail('expected parseDsn to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DsnMalformedError);
      expect((err as DsnMalformedError).input).toBe(original);
      expect((err as DsnMalformedError).code).toBe('DSN_MALFORMED');
    }
  });

  it('property: every well-formed DSN parses (50 cases)', () => {
    const envArb: fc.Arbitrary<DsnEnvironment> = fc.constantFrom<DsnEnvironment>(
      'live',
      'staging',
      'dev',
    );
    const hex64Arb: fc.Arbitrary<string> = fc
      .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
        minLength: 64,
        maxLength: 64,
      })
      .map((chars) => chars.join(''));

    fc.assert(
      fc.property(envArb, hex64Arb, (env, key) => {
        const prefixed = `nmk_${env}_${key}`;
        const parsedPrefixed = parseDsn(prefixed);
        expect(parsedPrefixed.environment).toBe(env);
        expect(parsedPrefixed.publicKey).toBe(key);

        const parsedRaw = parseDsn(key);
        expect(parsedRaw.environment).toBeNull();
        expect(parsedRaw.publicKey).toBe(key);
      }),
      { numRuns: 50 },
    );
  });
});
