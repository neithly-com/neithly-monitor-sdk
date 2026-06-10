---
'@neithly-com/monitor-node': minor
---

Add `@neithly-com/monitor-node/nestjs` subpath — one-liner NestJS adoption
(`MonitorModule.forRoot()` + `MonitorService` + `MonitorContextInterceptor` +
`preloadMonitor` / side-effect `./preload` entry).

Mirrors the `@neithly-com/neithly-auth-sdk/nestjs` model: peer-only NestJS
dependencies (`@nestjs/common` / `@nestjs/core` are now optional peers in
the `^10 || ^11` range, moved out of `dependencies`); main entry stays
usable without NestJS installed. The classic `NeithlyModule` continues to
ship from the root entry — the new subpath is an additive, opinionated
alternative that replaces the hand-rolled
`src/common/monitor/{preload,module,service,context-interceptor,config}.ts`
every backend used to ship.
