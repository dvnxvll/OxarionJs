# Server Options

`Oxarion.start` accepts one options object

```ts
await Oxarion.start({
  host: "127.0.0.1",
  port: 3000,
  httpHandler: (router) => {},
})
```

## Network

- `port?: number | string`
- `host?: string`
- `unix?: never`
- `reusePort?: boolean`
- `ipv6Only?: boolean`
- `idleTimeout?: number`

## Routing Lifecycle

- `httpHandler: (router) => void`
- `safeMwRegister?: (router) => void`
- `notFoundHandler?: (req, res) => void | Response`
- `errorHandler?: (error, req, res) => void | Response`

## Static Pages

- `pagesDir?: string`
- `cachePages?: boolean`

## Runtime Behavior

- `debugRoutes?: boolean`
- `checkLatestVersion?: boolean`

## Dynamic Routing

- `dynamicRouting?: DynamicRoutingOptions`
- Route module can use named function exports or a class with static HTTP methods

```ts
type DynamicRoutingOptions = {
  enabled?: boolean
  dir: string
  handlerFile?: string
  extensions?: string[]
  onConflict?: "error" | "override" | "keepManual"
}
```

## WebSocket

- `wsHandler?: (watcher) => void`

## Full Example

```ts
import Oxarion, { Middleware, OxarionResponse } from "oxarionjs"

await Oxarion.start({
  host: "127.0.0.1",
  port: 3000,
  debugRoutes: false,
  checkLatestVersion: false,
  pagesDir: "pages",
  cachePages: true,
  dynamicRouting: {
    dir: "dyn",
    handlerFile: "api",
    extensions: ["ts", "js"],
    onConflict: "keepManual",
  },
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => {
      res.send("home")
    })
  },
  safeMwRegister: (router) => {
    router.multiMiddleware("/", [Middleware.cors(), Middleware.logger()], true)
  },
  notFoundHandler: () => {
    return OxarionResponse.json({ error: "not found" }, { status: 404 })
  },
  errorHandler: (error) => {
    return OxarionResponse.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    )
  },
})
```
