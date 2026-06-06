// QA #1 — monitor-core parses, shapes, and envelopes correctly.
import { parseDsn, shapeException, Scope, toOtlpLogRecord } from '@neithly-com/monitor-core';

const DSN = process.env.NEITHLY_DSN;
console.log('## QA #1 — monitor-core');

const parsed = parseDsn(DSN);
console.log('  parseDsn:', { publicKey: parsed.publicKey.slice(0, 8) + '…', environment: parsed.environment });

try {
  throw new TypeError('demo error from QA');
} catch (err) {
  const exc = shapeException(err);
  console.log('  shapeException:', {
    type: exc['exception.type'],
    message: exc['exception.message'],
    stackFirstLine: exc['exception.stacktrace'].split('\n')[0],
  });
}

const scope = new Scope();
scope.setUser({ id: 'u-qa', email: 'qa@neithly.dev' });
scope.setTags({ feature: 'integration-test', release: 'qa-1' });
scope.addBreadcrumb({ category: 'navigation', message: 'page open', level: 'info' });
scope.addBreadcrumb({ category: 'click', message: 'submit form', level: 'info' });

const record = toOtlpLogRecord({
  scope: scope.snapshot(),
  message: { body: 'core integration test', level: 'info' },
  sdkName: '@neithly-com/monitor-core',
  sdkVersion: '0.0.0',
});
console.log('  toOtlpLogRecord:', {
  severityNumber: record.severityNumber,
  body: record.body.stringValue,
  attrCount: record.attributes.length,
  hasUser: record.attributes.some(a => a.key === 'user.id'),
  hasBreadcrumbs: record.attributes.some(a => a.key === 'neithly.breadcrumbs'),
});

console.log('  ✓ core PASS');
