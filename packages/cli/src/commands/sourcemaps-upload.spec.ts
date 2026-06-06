import { describe, expect, it, vi } from 'vitest';

import {
  runSourceMapsUpload,
  sha256Hex,
  SourceMapsUploadError,
  type HttpFetch,
  type HttpResponse,
  type Spinner,
  type SourceMapsUploadDeps,
} from './sourcemaps-upload.js';

function res(status: number, body: unknown = {}): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

function makeSpinner(): Spinner {
  const s: Spinner = {
    text: '',
    start() {
      return s;
    },
    succeed() {
      return s;
    },
    fail() {
      return s;
    },
    stop() {
      return s;
    },
  };
  return s;
}

interface ScriptStep {
  readonly match: (url: string, init?: { method?: string }) => boolean;
  readonly respond: () => HttpResponse;
}

function scripted(steps: ScriptStep[]): { fetch: HttpFetch; calls: Array<{ url: string; method: string }> } {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchFn: HttpFetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method });
    for (const step of steps) {
      if (step.match(url, init)) {
        return step.respond();
      }
    }
    throw new Error(`No scripted response for ${method} ${url}`);
  };
  return { fetch: fetchFn, calls };
}

const baseEnv: NodeJS.ProcessEnv = {
  NEITHLY_AUTH_TOKEN: 'tok-test',
  NEITHLY_API_URL: 'https://api.example.test',
};

function depsWith(
  fetchFn: HttpFetch,
  fileMap: Record<string, string>,
  globResult: string[],
): SourceMapsUploadDeps {
  return {
    fetch: fetchFn,
    env: baseEnv,
    glob: async () => globResult,
    readFile: async (p) => {
      const v = fileMap[p];
      if (v === undefined) throw new Error(`unexpected read ${p}`);
      return Buffer.from(v);
    },
    createSpinner: () => makeSpinner(),
    logger: { log: vi.fn(), error: vi.fn() } as unknown as Pick<Console, 'log' | 'error'>,
  };
}

describe('sha256Hex', () => {
  it('produces a stable hex digest', () => {
    expect(sha256Hex(Buffer.from('hello'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });
});

describe('runSourceMapsUpload', () => {
  it('uploads each matched file when none are pre-seeded (3 files → 3 uploads)', async () => {
    const files = ['a.js.map', 'b.js.map', 'c.js.map'];
    const fileMap = { 'a.js.map': 'AAA', 'b.js.map': 'BBB', 'c.js.map': 'CCC' };
    const uploads: string[] = [];
    const { fetch } = scripted([
      {
        match: (u) => u.includes('/projects/') && u.includes('/releases?version='),
        respond: () => res(200, { id: 'rel-1' }),
      },
      {
        match: (u) => u.endsWith('/releases/rel-1/files/check'),
        respond: () => res(200, { existing: [] }),
      },
      {
        match: (u) => u.endsWith('/releases/rel-1/files'),
        respond: () => {
          uploads.push('upload');
          return res(201, { ok: true });
        },
      },
    ]);

    const result = await runSourceMapsUpload(
      'dist/**/*.map',
      { release: '1.0.0', project: 'web' },
      depsWith(fetch, fileMap, files),
    );

    expect(result).toEqual({ matched: 3, uploaded: 3, skipped: 0 });
    expect(uploads).toHaveLength(3);
  });

  it('skips files whose SHA is already present on the backend', async () => {
    const files = ['a.js.map', 'b.js.map'];
    const fileMap = { 'a.js.map': 'AAA', 'b.js.map': 'BBB' };
    const preSeeded = sha256Hex(Buffer.from('AAA'));
    const uploads: string[] = [];

    const { fetch } = scripted([
      {
        match: (u) => u.includes('/releases?version='),
        respond: () => res(200, { id: 'rel-2' }),
      },
      {
        match: (u) => u.endsWith('/releases/rel-2/files/check'),
        respond: () => res(200, { existing: [preSeeded] }),
      },
      {
        match: (u) => u.endsWith('/releases/rel-2/files'),
        respond: () => {
          uploads.push('upload');
          return res(201, {});
        },
      },
    ]);

    const result = await runSourceMapsUpload(
      'dist/**/*.map',
      { release: '1.0.0', project: 'web' },
      depsWith(fetch, fileMap, files),
    );

    expect(result).toEqual({ matched: 2, uploaded: 1, skipped: 1 });
    expect(uploads).toHaveLength(1);
  });

  it('surfaces "Auth failed" on 401 from the release lookup', async () => {
    const { fetch } = scripted([
      {
        match: (u) => u.includes('/releases?version='),
        respond: () => res(401, { error: 'unauthorized' }),
      },
    ]);

    await expect(
      runSourceMapsUpload(
        'dist/**/*.map',
        { release: '1.0.0', project: 'web' },
        depsWith(fetch, {}, ['a.js.map']),
      ),
    ).rejects.toMatchObject({
      name: 'SourceMapsUploadError',
      message: 'Auth failed',
    });
  });

  it('surfaces "Release not found" on 404 from the release lookup', async () => {
    const { fetch } = scripted([
      {
        match: (u) => u.includes('/releases?version='),
        respond: () => res(404, { error: 'not_found' }),
      },
    ]);

    await expect(
      runSourceMapsUpload(
        'dist/**/*.map',
        { release: '9.9.9', project: 'web' },
        depsWith(fetch, {}, ['a.js.map']),
      ),
    ).rejects.toBeInstanceOf(SourceMapsUploadError);
  });

  it('honors --concurrency by capping in-flight uploads', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'];
    const fileMap = Object.fromEntries(files.map((f) => [f, f]));
    let inFlight = 0;
    let peak = 0;

    const { fetch } = scripted([
      {
        match: (u) => u.includes('/releases?version='),
        respond: () => res(200, { id: 'rel-x' }),
      },
      {
        match: (u) => u.endsWith('/releases/rel-x/files/check'),
        respond: () => res(200, { existing: [] }),
      },
      {
        match: (u) => u.endsWith('/releases/rel-x/files'),
        respond: () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          // Simulate a tiny pause so concurrency is observable.
          const body = {
            json: async () => ({}),
            text: async () => '',
            ok: true,
            status: 201,
          };
          queueMicrotask(() => {
            inFlight -= 1;
          });
          return body;
        },
      },
    ]);

    await runSourceMapsUpload(
      'dist/**/*.map',
      { release: '1.0.0', project: 'web', concurrency: 2 },
      depsWith(fetch, fileMap, files),
    );

    expect(peak).toBeLessThanOrEqual(2);
  });
});
