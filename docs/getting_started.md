# Getting Started

## Prerequisites

- Bun `1.2.19` or newer
- TypeScript project if you want typed routes and params

## Install

```bash
bun add oxarionjs
```

## Create Your First Server

```ts
import Oxarion from "oxarionjs"

await Oxarion.start({
  host: "127.0.0.1",
  port: 3000,
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => {
      res.json({ message: "hello" })
    })
  },
})
```

Run

```bash
bun run src/index.ts
```

## Minimal Project Shape

```text
project/
  src/
    index.ts
  pages/
```

`pages/` is optional unless you use `res.sendPage`

## Add Middleware Safely

Use `safeMwRegister` when you want middleware applied after route registration

```ts
import Oxarion, { Middleware } from "oxarionjs"

await Oxarion.start({
  port: 3000,
  httpHandler: (router) => {
    router.addHandler("GET", "/health", (_req, res) => {
      res.send("ok")
    })
  },
  safeMwRegister: (router) => {
    router.multiMiddleware("/", [Middleware.cors(), Middleware.logger()], true)
  },
})
```
