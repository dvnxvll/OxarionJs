# OxarionJs Docs

This folder contains practical guides and API usage for OxarionJs

## Read First

- [Getting Started](./getting_started.md)
- [Server Options](./server_options.md)

## Core Usage

- [Routing](./routing.md)
- [Route Injector](./route_injector.md)
- [Dynamic Routing](./dynamic_routing.md)
- [SSR Templates](./ssr_templates.md)
- [Dynamic HTML](./dynamic_html.md)
- [Middleware](./middleware.md)
- [Request And Response](./request_and_response.md)
- [Production Deployment](./production_deployment.md)
- [WebSocket](./websocket.md)
- [Api Reference](./api_reference.md)

## Runtime And Validation

- [Testing And Benchmarking](./testing_and_benchmarking.md)

## Quick Feature Map

- HTTP router with static, dynamic, and catch all params
- Route groups with shared prefix and middleware
- File based dynamic routing with `api.ts` or `api.js` using function exports or static class methods
- Cached SSR template rendering with `res.render()` and `res.renderFragment()`
- Optional dynamic HTML runtime with `ox-*` attributes and `router.serveOx()`
- Middleware pipeline with built in helpers
- Custom `notFoundHandler` and `errorHandler`
- `OxarionResponse` instance and static helper style
- Native WebSocket integration per route
- Typed JSON WebSocket dispatcher
- Per-route request/response validation and OpenAPI schemas
- Bun test friendly project setup
