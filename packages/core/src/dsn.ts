// DSN (Data Source Name) parser for @neithly-com/monitor-core.
//
// Accepted shapes (after trimming surrounding whitespace):
//   - `nmk_<env>_<64-char lowercase hex>` where env in {live, staging, dev}
//   - raw 64-char lowercase hex (no prefix; environment is null)
//
// Anything else (mixed-case hex, wrong length, unknown env, empty, ...) is
// rejected with a `DsnMalformedError` that carries the original input.

export type DsnEnvironment = 'live' | 'staging' | 'dev';

export interface ParsedDsn {
  publicKey: string;
  environment: DsnEnvironment | null;
}

export class DsnMalformedError extends Error {
  public readonly code = 'DSN_MALFORMED' as const;
  public readonly input: string;

  public constructor(input: string) {
    super('DSN is malformed');
    this.name = 'DsnMalformedError';
    this.input = input;
  }
}

const HEX_64 = /^[0-9a-f]{64}$/;
const PREFIXED_DSN = /^nmk_(live|staging|dev)_([0-9a-f]{64})$/;

const KNOWN_ENVIRONMENTS: ReadonlySet<DsnEnvironment> = new Set<DsnEnvironment>([
  'live',
  'staging',
  'dev',
]);

function isDsnEnvironment(value: string): value is DsnEnvironment {
  return KNOWN_ENVIRONMENTS.has(value as DsnEnvironment);
}

export function parseDsn(input: string): ParsedDsn {
  if (typeof input !== 'string') {
    throw new DsnMalformedError(String(input));
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new DsnMalformedError(input);
  }

  const prefixed = PREFIXED_DSN.exec(trimmed);
  if (prefixed !== null) {
    const env = prefixed[1];
    const key = prefixed[2];
    if (env === undefined || key === undefined || !isDsnEnvironment(env)) {
      throw new DsnMalformedError(input);
    }
    return { publicKey: key, environment: env };
  }

  if (HEX_64.test(trimmed)) {
    return { publicKey: trimmed, environment: null };
  }

  throw new DsnMalformedError(input);
}
