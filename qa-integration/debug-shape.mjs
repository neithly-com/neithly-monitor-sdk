import { Scope, toOtlpLogRecord, toOtlpLogsRequest, shapeException } from '@neithly-com/monitor-core';
const scope = new Scope();
scope.setUser({ id: 'u-qa' });
let exc;
try { throw new Error('x'); } catch(e) { exc = shapeException(e); }
const r = toOtlpLogRecord({ scope: scope.snapshot(), exception: exc, sdkName: 'x', sdkVersion: '0' });
const env = toOtlpLogsRequest([r], { sdkName: 'x', sdkVersion: '0' });
console.log(JSON.stringify(env, null, 2).slice(0, 1500));
