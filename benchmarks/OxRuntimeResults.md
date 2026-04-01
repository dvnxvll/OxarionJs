# Ox SSR Runtime Benchmark

- concurrency: 200
- warmup: 3s
- measured duration: 10s

| Endpoint | Req/Sec | Avg Latency | P95 | P99 | Success Rate |
| --- | ---: | ---: | ---: | ---: | ---: |
| Health | 68448.10 | 2.921 ms | 9.525 ms | 17.751 ms | 100.00% |
| SSR Page | 66978.67 | 2.985 ms | 4.430 ms | 22.832 ms | 100.00% |
| Fragment | 71591.56 | 2.793 ms | 3.454 ms | 30.998 ms | 100.00% |
| Ox Runtime | 75924.04 | 2.631 ms | 3.272 ms | 33.909 ms | 100.00% |
| Session Fragment POST | 68278.61 | 2.928 ms | 5.409 ms | 12.439 ms | 100.00% |
