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
- `notFoundHandler?: (req, res) => void | Response | OxarionResponse`
- `errorHandler?: (error, req, res) => void | Response | OxarionResponse`

## Static Pages

- `pagesDir?: string`
- `cachePages?: boolean`

## Templates

- `template?: TemplateOptions`

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
import Oxarion, { Middleware } from "oxarionjs"

await Oxarion.start({
  host: "127.0.0.1",
  port: 3000,
  debugRoutes: false,
  checkLatestVersion: false,
  pagesDir: "pages",
  cachePages: true,
  template: {
    pagesDir: "pages",
    fragmentsDir: "fragments",
    cache: true,
  },
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
  notFoundHandler: (_req, res) => {
    return res.json({ error: "not found" }, { status: 404 })
  },
  errorHandler: (error, _req, res) => {
    return res.json(
      { error: error instanceof Error ? error.message : "unknown" },
      { status: 500 }
    )
  },
})
```
