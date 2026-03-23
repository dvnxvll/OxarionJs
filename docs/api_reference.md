# API Reference

This page lists the public API in one place for quick lookup

## Exports

```ts
import Oxarion, {
  Oxarion,
  OxarionResponse,
  Middleware,
  RoutesWrapper,
  ParsedFormData,
} from "oxarionjs"
```

## Oxarion

### Oxarion.start(options)

Starts Bun server and returns server instance

### Oxarion.stop()

Stops current server and cleans router state

## Router Methods In httpHandler

### addHandler

```ts
router.addHandler(method, path, handler)
```

### injectWrapper

```ts
router.injectWrapper(base_path, wrapper)
```

### middleware

```ts
router.middleware(base_path, middleware_fn, all_routes?)
```

### multiMiddleware

```ts
router.multiMiddleware(base_path, middleware_array, all_routes?)
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
- `req.raw` native Request

## Response API

### Instance style

- `res.setStatus(code)`
- `res.setHeader(key, value)`
- `res.setHeaders(obj)`
- `res.send(body)`
- `res.json(obj)`
- `res.redirect(url, status?)`
- `await res.sendPage(file_path, compression?)`
- `await res.sendFile(file_path, content_type?)`

### Static helper style

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

## Dynamic Route Types

```ts
type DynamicRouteParams = Record<string, string | string[] | undefined>

type DynamicRouteHandler<TParams extends DynamicRouteParams = DynamicRouteParams> = (
  req: OxarionRequest<TParams>,
  res: OxarionResponse
) => void | Response | Promise<void | Response>

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
- return native `Response`

This works for

- route handler in `addHandler`
- dynamic route method exports or static class methods
- `notFoundHandler`
- `errorHandler`
