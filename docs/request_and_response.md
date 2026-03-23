# Request And Response

## OxarionRequest

Inside every handler, `req` is `OxarionRequest`

### Core Methods

- `req.getParam(name)`
- `req.url()`
- `req.method()`
- `req.getHeaders()`
- `req.getQuery(name)`
- `req.getQueries()`
- `await req.json()`
- `await req.text()`
- `await req.form()`

## Request Usage

```ts
router.addHandler("POST", "/user/[id]", async (req, res) => {
  const id = req.getParam("id")
  const verbose = req.getQuery("verbose")
  const body = await req.json()

  res.json({ id, verbose, body })
})
```

## ParsedFormData

`await req.form()` returns `ParsedFormData`

Useful methods

- `getField(key)`
- `getAllFields()`
- `getFile(key)`
- `getFiles(key)`
- `getAllFiles()`
- `getMimeType(key)`
- `getMimeTypes()`

## OxarionResponse Instance Style

### Core Methods

- `res.setStatus(code)`
- `res.setHeader(key, value)`
- `res.setHeaders(headers)`
- `res.send(body)`
- `res.json(obj)`
- `res.redirect(url, status?)`

### Static Helpers For Return Style

- `OxarionResponse.json(data, init?)`
- `OxarionResponse.text(text, init?)`
- `OxarionResponse.html(html, init?)`
- `OxarionResponse.redirect(url, status?)`

## Dual Style Example

```ts
import { OxarionResponse } from "oxarionjs"

router.addHandler("GET", "/instance", (_req, res) => {
  res.setStatus(200).json({ style: "instance" })
})

router.addHandler("GET", "/return", () => {
  return OxarionResponse.json({ style: "return" }, { status: 200 })
})
```

## sendPage

```ts
await res.sendPage("home")
await res.sendPage("home", { type: "gzip", level: 6 })
```

Notes

- Automatically appends `.html` when missing
- Resolves path under `pagesDir`
- Blocks path traversal outside pages root
- Returns controller with `setStatic()` and `disableStatic()`

## sendFile

```ts
await res.sendFile("public/logo.png", "image/png")
```

Notes

- Resolves path under project root
- Blocks path traversal outside project root
