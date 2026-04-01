# Dynamic Routing

Dynamic routing auto loads handler files from a directory

## Config

```ts
await Oxarion.start({
  dynamicRouting: {
    enabled: true,
    dir: "dyn",
    handlerFile: "api",
    extensions: ["ts", "js"],
    onConflict: "keepManual",
  },
  httpHandler: () => {},
})
```

## Route Mapping

If `dir` is `dyn`

- `dyn/api.ts` maps to `/`
- `dyn/test/api.ts` maps to `/test`
- `dyn/user/[id]/api.ts` maps to `/user/[id]`
- `dyn/docs/[...parts]/api.ts` maps to `/docs/[...parts]`

## Supported Method Exports

In each route module you can use function exports or a class with static methods

- `GET`
- `HEAD`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS`

Each exported method must receive `req` and `res`

```ts
// dyn/test/api.ts
import type { DynamicRouteHandler } from "oxarionjs"

export const GET: DynamicRouteHandler = async (req, res) => {
  return res.json({ path: req.url() })
}

export const POST: DynamicRouteHandler = async (req, res) => {
  const payload = await req.json()
  return res.json({ payload }, { status: 201 })
}
```

Static class style

```ts
// dyn/test/api.ts
import {
  type OxarionRequest,
  type OxarionResponse,
} from "oxarionjs"

export default class TestApi {
  static async GET(req: OxarionRequest, res: OxarionResponse) {
    return res.json({ path: req.url() })
  }

  static async POST(req: OxarionRequest, res: OxarionResponse) {
    const payload = await req.json()
    return res.json({ payload }, { status: 201 })
  }
}
```

You can still return native `Response` or `OxarionResponse.*(...)` if you prefer

You can also export a named class when there is no default class export

You can type route params too

```ts
import type { DynamicRouteHandler } from "oxarionjs"

type UserParams = {
  id: string | undefined
}

export const GET: DynamicRouteHandler<UserParams> = async (req, _res) => {
  return Response.json({ id: req.getParam("id") })
}
```

## Conflict Strategy

When manual routes and dynamic routes target the same `method + path`

- `keepManual` keeps manual route and skips dynamic one
- `override` removes manual route and uses dynamic one
- `error` throws during startup

## Recommended Directory Shape

```text
dyn/
  api.ts
  test/
    api.ts
  user/
    [id]/
      api.ts
  docs/
    [...parts]/
      api.ts
```
