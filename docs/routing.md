# Routing

## HTTP Methods

Oxarion supports

- `GET`
- `HEAD`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS`

## addHandler

```ts
router.addHandler("GET", "/posts/[id]", (req, res) => {
  const id = req.getParam("id")
  res.json({ id })
})
```

Path rules

- Path starts with `/`
- `[id]` for single segment param
- `[...slug]` for catch all param

## Static And Dynamic Route Examples

```ts
router.addHandler("GET", "/", (_req, res) => {
  res.send("home")
})

router.addHandler("GET", "/user/[id]", (req, res) => {
  res.send(`user ${req.getParam("id")}`)
})

router.addHandler("GET", "/docs/[...parts]", (req, res) => {
  const parts = req.getParam("parts")
  res.json({ parts })
})
```

## Route Groups

Use `group` to apply prefix and optional middleware to everything inside

```ts
import { Middleware } from "oxarionjs"

router.group(
  "/api",
  (api) => {
    api.group("/v1", (v1) => {
      v1.addHandler("GET", "/users/[id]", (req, res) => {
        res.json({ id: req.getParam("id") })
      })
    })
  },
  [Middleware.logger()]
)
```

## RoutesWrapper

`RoutesWrapper` helps split route modules by feature

```ts
import { RoutesWrapper } from "oxarionjs"

const account_routes = new RoutesWrapper().inject((router) => {
  router.addHandler("GET", "/profile", (_req, res) => {
    res.send("profile")
  })
})

router.injectWrapper("/account", account_routes)
```

## Handler Return Style

You can mutate `res` or return a native `Response`

```ts
import { OxarionResponse } from "oxarionjs"

router.addHandler("GET", "/legacy", (_req, res) => {
  res.send("legacy style")
})

router.addHandler("GET", "/next-style", () => {
  return OxarionResponse.json({ ok: true }, { status: 200 })
})
```
