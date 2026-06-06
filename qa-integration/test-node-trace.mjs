// Diagnostic: POST + immediately retry + sniff the response twice
const DSN = process.env.NEITHLY_DSN;
const url = 'http://localhost:3001/v1/logs';

const body = {
  resourceLogs: [{
    resource: { attributes: [
      { key: 'service.name', value: { stringValue: 'qa-debug' } },
    ]},
    scopeLogs: [{
      scope: { name: 'qa', version: '0' },
      logRecords: [{
        timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
        observedTimeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
        severityNumber: 17,
        severityText: 'ERROR',
        body: { stringValue: 'qa diagnostic error' },
        attributes: [
          { key: 'exception.type', value: { stringValue: 'QaDebugError' } },
          { key: 'exception.message', value: { stringValue: 'qa diagnostic error' } },
          { key: 'exception.stacktrace', value: { stringValue: 'QaDebugError: qa\n    at qa.mjs:1:1' } },
        ],
      }],
    }],
  }],
};

console.log('POST', url);
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DSN}` },
  body: JSON.stringify(body),
});
console.log('status:', res.status);
console.log('headers:', Object.fromEntries(res.headers.entries()));
console.log('body:', await res.text());
