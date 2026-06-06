// Public surface of @neithly-com/monitor-core.

export const SDK_NAME = '@neithly-com/monitor-core';

// DSN
export { parseDsn, DsnMalformedError } from './dsn.js';
export type { DsnEnvironment, ParsedDsn } from './dsn.js';

// Exception shaping
export { shapeException } from './exception.js';
export type { ExceptionAttributes } from './exception.js';

// Breadcrumbs
export { BreadcrumbRing, serialiseBreadcrumbs } from './breadcrumbs.js';
export type { Breadcrumb, BreadcrumbLevel, SerialisedBreadcrumb } from './breadcrumbs.js';

// Scope
export { Scope } from './scope.js';
export type { ScopeSnapshot, UserContext } from './scope.js';

// Endpoints
export { resolveEndpoints } from './endpoints.js';
export type { MonitorEndpoints } from './endpoints.js';

// OTLP envelope
export { toOtlpLogRecord, toOtlpLogsRequest } from './otlp-envelope.js';
export type {
  MessageInput,
  OtlpKeyValue,
  OtlpLogRecord,
  OtlpLogsRequest,
  SeverityLevel,
  ShapeOtlpLogRecordInput,
} from './otlp-envelope.js';
