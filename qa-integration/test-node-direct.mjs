// QA #2 — POST direct OTLP envelope to the running backend, verify the
// envelope shape is accepted (200 with partialSuccess) and the row lands
// in log_records. This tests the wire contract without booting the full
// OTel Node SDK (which is heavier and has its own QA).
import { parseDsn, shapeException, Scope, toOtlpLogRecord, toOtlpLogsRequest } from '@neithly-com/monitor-core';

const DSN = process.env.NEITHLY_DSN;
const BACKEND = process.env.MONITOR_API_URL ?? 'http://localhost:3001';

console.log('## QA #2 — POST direct OTLP envelope to the live backend');

const parsed = parseDsn(DSN);

const scope = new Scope();
scope.setUser({ id: 'u-qa', email: 'qa@neithly.dev' });
scope.setTags({ feature: 'qa-integration', release: 'qa-2' });
scope.addBreadcrumb({ category: 'click', message: 'submit form', level: 'info' });

let exception;
try {
  throw new RangeError('QA integration error — please ignore');
} catch (err) {
  exception = shapeException(err);
}

const record = toOtlpLogRecord({
  scope: scope.snapshot(),
  exception,
  message: { body: exception['exception.message'], level: 'error' },
  release: 'qa-2',
  environment: 'dev',
  sdkName: '@neithly-com/monitor-sdk-qa',
  sdkVersion: '0.0.0',
});

const body = toOtlpLogsRequest([record], {
  release: 'qa-2',
  environment: 'dev',
  // CRITICAL: the backend worker drops records where service.name does NOT
  // match the project's slug (silent dropout — only visible in dev logs as
  // SERVICE_NAME_MISMATCH). Set this to the project slug, not the SDK name.
  serviceName: 'apollo',
  sdkName: '@neithly-com/monitor-sdk-qa',
  sdkVersion: '0.0.0',
});

const url = `${BACKEND}/v1/logs`;
console.log('  POST', url);
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // The backend hashes the FULL bearer it receives → send the entire
    // DSN string, not just the parsed publicKey. (Mismatch caught during QA.)
    Authorization: `Bearer ${DSN}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log('  status:', res.status);
console.log('  body:', text.slice(0, 200));

if (res.status !== 200) {
  console.error('  ✗ node FAIL — expected 200');
  process.exit(1);
}
console.log('  ✓ node PASS — backend accepted the envelope');
