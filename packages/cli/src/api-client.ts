// Thin `fetch` wrapper used by `monitor` CLI commands to talk to the neithly API.
//
// - Adds `Authorization: Bearer <apiToken>` and `Content-Type: application/json`.
// - Returns parsed JSON on 2xx; throws `ApiError` (with status + parsed body) otherwise.
// - All requests are issued against `apiUrl` joined with the given path.

export interface CreateMonitorClientOptions {
  apiUrl: string;
  apiToken: string;
  fetch?: typeof fetch;
}

export interface MonitorRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface MonitorClient {
  request: <T = unknown>(path: string, init?: MonitorRequestInit) => Promise<T>;
  apiUrl: string;
}

export class ApiError extends Error {
  public readonly code = 'API_ERROR' as const;
  public readonly status: number;
  public readonly body: unknown;

  public constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Neithly API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }
  const text = await response.text();
  return text.length === 0 ? null : text;
}

function mergeHeaders(
  base: Record<string, string>,
  extra: Record<string, string> | undefined,
): Record<string, string> {
  if (extra === undefined) return base;
  return { ...base, ...extra };
}

export function createMonitorClient(options: CreateMonitorClientOptions): MonitorClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation available — pass `fetch` explicitly.');
  }

  const baseUrl = options.apiUrl;
  const token = options.apiToken;

  async function request<T = unknown>(path: string, init: MonitorRequestInit = {}): Promise<T> {
    const url = joinUrl(baseUrl, path);
    const method = init.method ?? 'GET';

    const baseHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    let body: string | undefined;
    if (init.body !== undefined) {
      baseHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }

    const headers = mergeHeaders(baseHeaders, init.headers);

    const requestInit: RequestInit = { method, headers };
    if (body !== undefined) {
      requestInit.body = body;
    }
    if (init.signal !== undefined) {
      requestInit.signal = init.signal;
    }

    const response = await fetchImpl(url, requestInit);

    if (!response.ok) {
      const errorBody = await parseBody(response);
      throw new ApiError(response.status, errorBody);
    }

    if (response.status === 204) {
      // 204 No Content: caller declares T at the call site.
      return null as T;
    }

    const parsed = await parseBody(response);
    return parsed as T;
  }

  return { request, apiUrl: baseUrl };
}
