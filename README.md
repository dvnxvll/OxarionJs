# OxarionJs

![npm downloads](https://img.shields.io/npm/dm/oxarionjs?style=flat-square&logo=npm&color=blue)

OxarionJs is a backend framework on top of Bun with a TypeScript first API

## Why OxarionJs

- Fast runtime on Bun
- Type safe route params
- Route groups and middleware chain support
- File based dynamic routing with `api.ts` and `api.js`
- Request and response helper API
- Native WebSocket route integration
- Test friendly workflow with Bun

## Install

```bash
bun add oxarionjs
```

## Quick Start

```ts
import Oxarion, { Middleware } from "oxarionjs"

await Oxarion.start({
  host: "127.0.0.1",
  port: 3000,
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => {
      res.json({ message: "Welcome" })
    })
  },
  safeMwRegister: (router) => {
    router.multiMiddleware("/", [Middleware.cors(), Middleware.logger()], true)
  },
})
```

Run

```bash
bun run src/index.ts
```

## Dynamic Routing

```ts
import Oxarion, { OxarionResponse } from "oxarionjs"

await Oxarion.start({
  dynamicRouting: {
    dir: "dyn",
    handlerFile: "api",
    extensions: ["ts", "js"],
    onConflict: "keepManual",
  },
  httpHandler: () => {},
})
```

`dyn/test/api.ts` maps to `/test`
Route modules can export functions (`GET`, `POST`) or a static class

```ts
// dyn/test/api.ts
import {
  OxarionResponse,
  type OxarionRequest,
} from "oxarionjs"

export default class TestApi {
  static async GET(
    req: OxarionRequest,
    _res: OxarionResponse
  ) {
    return OxarionResponse.json({ path: req.url() })
  }
}
```

## Docs

- [Docs Index](./docs/index.md)
- [Getting Started](./docs/getting_started.md)
- [Server Options](./docs/server_options.md)
- [Routing](./docs/routing.md)
- [Dynamic Routing](./docs/dynamic_routing.md)
- [Middleware](./docs/middleware.md)
- [Request And Response](./docs/request_and_response.md)
- [WebSocket](./docs/websocket.md)
- [Api Reference](./docs/api_reference.md)
- [Testing And Benchmarking](./docs/testing_and_benchmarking.md)

## License

[MIT](./LICENSE)
