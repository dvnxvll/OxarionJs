# WebSocket

Oxarion handles WebSocket per route path

## Step 1 Mark HTTP Path As WebSocket

```ts
httpHandler: (router) => {
  router.switchToWs("/ws")
}
```

## Step 2 Register Handlers In wsHandler

```ts
wsHandler: (watcher) => {
  watcher.path("/ws", {
    onOpen: (ws) => {
      ws.send("connected")
    },
    onMessage: (ws, message) => {
      ws.send(`echo: ${message.toString()}`)
    },
    onClose: (_ws, code, reason) => {
      console.log(code, reason)
    },
    onDrain: (_ws) => {},
  })
}
```

## Full Example

```ts
import Oxarion from "oxarionjs"

await Oxarion.start({
  port: 3000,
  httpHandler: (router) => {
    router.addHandler("GET", "/", (_req, res) => {
      res.send("ok")
    })

    router.switchToWs("/ws")
  },
  wsHandler: (watcher) => {
    watcher.path("/ws", {
      onMessage: (ws, msg) => {
        ws.send(msg)
      },
    })
  },
})
```

## Typed JSON Dispatcher

Use `WebSocket.dispatcher()` to route incoming JSON messages by `type`

```ts
import Oxarion, { WebSocket } from "oxarionjs"

await Oxarion.start({
  port: 3000,
  httpHandler: (router) => {
    router.switchToWs("/ws")
  },
  wsHandler: (watcher) => {
    watcher.path(
      "/ws",
      WebSocket.dispatcher({
        handlers: {
          ping: async (ctx) => {
            ctx.ws.send("pong")
          },
        },
      }),
    )
  },
})
```

## Message Middleware

Pass `middlewares` so they run before the dispatcher  
Middleware can override `ctx.json` so the dispatcher uses it for `type`

```ts
import Oxarion, { WebSocket } from "oxarionjs"

await Oxarion.start({
  port: 3000,
  httpHandler: (router) => {
    router.switchToWs("/ws")
  },
  wsHandler: (watcher) => {
    watcher.path(
      "/ws",
      WebSocket.dispatcher({
        middlewares: [
          async (ctx, next) => {
            ctx.json = { type: "ping", payload: { forced: true } }
            await next()
          },
        ],
        handlers: {
          ping: async (ctx) => {
            ctx.ws.send("ok")
          },
        },
      }),
    )
  },
})
```

## Notes

- Path in `switchToWs` and `watcher.path` must match
- If route is marked as WS but handler is missing, server returns `404`
- Non upgrade requests on normal paths continue through HTTP handlers
