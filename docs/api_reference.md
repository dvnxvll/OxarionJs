# API Reference

This page lists the public API in one place for quick lookup

## Exports

```ts
import Oxarion, {
  Oxarion,
  OxarionResponse,
  Middleware,
  OpenAPI,
  RoutesWrapper,
  ParsedFormData,
  WebSocket,
} from "oxarionjs"
```

## Oxarion

### Oxarion.start(options)

Starts Bun server and returns server instance

### Oxarion.stop()

Stops current server and cleans router state

### app.request(input)

Runs an in-process HTTP request against an app created with `Oxarion.create()`

### app.render(page, data?)

Renders a full page template to an HTML string

### app.renderFragment(fragment, data?)

Renders a fragment template to an HTML string

## Router Methods In httpHandler

### addHandler

```ts
router.addHandler(method, path, handler)
```

### addHandlerOpenApi

```ts
router.addHandlerOpenApi(method, path, handler, openapiDefinition)
```

### injectWrapper

```ts
router.injectWrapper(base_path, wrapper)
```

Deprecated. Use `router.mount(base_path, wrapper)` instead. `injectWrapper()` will be removed in `1.5.x`.

### middleware

```ts
router.middleware(base_path, middleware_fn, all_routes?)
```

### multiMiddleware

```ts
router.multiMiddleware(base_path, middleware_array, all_routes?)
```

### serveStatic

```ts
router.serveStatic(prefix, dir, options?)
```

### serveOx

```ts
const ox_script_path = router.serveOx()
```

Serves the Ox dynamic HTML runtime, keeps `/__oxarion/ox.js` as a stable alias, and returns the hashed runtime path

### serveOpenApi

```ts
router.serveOpenApi(spec_path, options)
```

### group

```ts
router.group(base_path, callback, middlewares?)
```

### switchToWs

```ts
router.switchToWs(path)
```

## Request API

`req` type is `OxarionRequest`

- `req.getParam(key)`
- `req.url()`
- `req.method()`
- `req.getHeaders()`
- `req.getQuery(name)`
- `req.getQueries()`
- `await req.json()`
- `await req.text()`
- `await req.form()`
- `req.getBody()`
- `req.getCookies()`
- `req.getCookie(name)`
- `req.getSessionId()`
- `req.getSessionValue(key)`
- `req.getCsrfToken()`
- `req.raw` native Request

## Response API

### Instance style

- `res.setStatus(code)`
- `res.setHeader(key, value)`
- `res.setHeaders(obj)`
- `res.send(body, init?)`
- `res.json(obj, init?)`
- `res.text(body, init?)`
- `res.html(body, init?)`
- `await res.render(page, data?, options?)`
- `await res.renderFragment(fragment, data?, options?)`
- `res.redirect(url, status?)`
- `await res.sendPage(file_path, compression?)`
- `await res.sendFile(file_path, content_type?, options?)`
- `res.setCookie(name, value, options?)`
- `res.clearCookie(name, options?)`

### Return helper style

- `return res.send(body, init?)`
- `return res.json(data, init?)`
- `return res.text(data, init?)`
- `return res.html(data, init?)`
- `return res.render(page, data?, options?)`
- `return res.renderFragment(fragment, data?, options?)`

- `OxarionResponse.json(data, init?)`
- `OxarionResponse.text(data, init?)`
- `OxarionResponse.html(data, init?)`
- `OxarionResponse.redirect(url, status?)`

## ParsedFormData API

- `getField(key)`
- `getAllFields()`
- `getFile(key)`
- `getFiles(key)`
- `getAllFiles()`
- `getMimeType(key)`
- `getMimeTypes()`

## Middleware Built Ins

- `Middleware.cors(options?)`
- `Middleware.json(options?)`
- `Middleware.urlencoded(options?)`
- `Middleware.logger(options?)`
- `Middleware.rateLimit(options)`
- `Middleware.securityHeaders(options?)`
- `Middleware.session(options?)`
- `Middleware.createMemorySessionStore(ttlMs?)`
- `Middleware.createRedisSessionStore(options?)`
- `Middleware.csrf(options?)`
- `Middleware.validateJson(schema, options?)`
- `Middleware.validateUrlencoded(schema, options?)`

## Ox Runtime

Dynamic HTML runtime attributes:

- `ox-anchor`
- `ox-place`
- `ox-mode`
- `ox-get`
- `ox-post`
- `ox-put`
- `ox-delete`
- `ox-target` low-level compatibility
- `ox-swap` low-level compatibility
- `ox-include`
- `ox-trigger`
- `ox-confirm`

Global browser helpers:

- `window.Ox.swap(target, html, mode?)`
- `window.Ox.apply({ place?, target?, html, mode?, swap? })`
- `window.Ox.request(target)`
- `window.Ox.getCsrfToken()`

## DynamicRoutingOptions

```ts
type DynamicRoutingOptions = {
  enabled?: boolean
  dir: string
  handlerFile?: string
  extensions?: string[]
  onConflict?: "error" | "override" | "keepManual"
}
```

## TemplateOptions

```ts
type TemplateOptions = {
  enabled?: boolean
  pagesDir?: string
  fragmentsDir?: string
  layoutsDir?: string
  cache?: boolean
  autoEscape?: boolean
  extension?: string
}
```

## SessionOptions

```ts
type SessionOptions = {
  cookieName?: string
  ttlMs?: number
  path?: string
  sameSite?: "lax" | "strict" | "none"
  secure?: boolean
  httpOnly?: boolean
  rolling?: boolean
  store?: SessionStore
  createId?: () => string
}
```

## SessionStore

```ts
type SessionStore = {
  get(session_id: string): SessionEntry | null | undefined | Promise<SessionEntry | null | undefined>
  set(session_id: string, entry: SessionEntry): void | Promise<void>
  delete?(session_id: string): void | Promise<void>
  cleanup?(now_ms: number): void | Promise<void>
}
```

## CsrfOptions

```ts
type CsrfOptions = {
  sessionKey?: string
  cookieName?: string
  fieldName?: string
  path?: string
  sameSite?: "lax" | "strict" | "none"
  secure?: boolean
}
```

## RedisSessionStoreOptions

```ts
type RedisSessionStoreOptions = {
  url?: string
  prefix?: string
  client?: RedisSessionClient
}
```

## RedisSessionClient

```ts
type RedisSessionClient = {
  get(key: string): string | null | Promise<string | null>
  set(key: string, value: string): void | Promise<void>
  del(key: string): void | Promise<void>
  expire(key: string, ttl_seconds: number): void | Promise<void>
  close?: () => void
}
```

## Dynamic Route Types

```ts
type DynamicRouteParams = Record<string, string | string[] | undefined>

type DynamicRouteHandler<TParams extends DynamicRouteParams = DynamicRouteParams> = (
  req: OxarionRequest<TParams>,
  res: OxarionResponse
) => void | Response | OxarionResponse | Promise<void | Response | OxarionResponse>

type DynamicRouteExportMap = Partial<Record<Method, DynamicRouteHandler<any>>>

type DynamicRouteClass = {
  new (...args: any[]): unknown
} & DynamicRouteExportMap

type DynamicRouteModule = DynamicRouteExportMap & {
  default?: DynamicRouteClass
  [key: string]: unknown
}
```

## Handler Return Types

Handler can

- mutate `res` and return nothing
- return `res.send(...)`, `res.json(...)`, `res.text(...)`, or `res.html(...)`
- return native `Response`
- return `OxarionResponse.*(...)`

This works for

- route handler in `addHandler`
- dynamic route method exports or static class methods
- `notFoundHandler`
- `errorHandler`
