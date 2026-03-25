# Framework Benchmark Results

Generated: 2026-03-25T15:47:36.820Z

## Test Configuration

- Concurrency: 200 connections
- Measured duration per run: 30 seconds
- Warmup duration per endpoint: 5 seconds
- Runs per endpoint: 5
- Aggregation: median of measured runs
- Runtime: Bun 1.3.11
- Tool: oha

## Frameworks Tested

| Framework | Port | Runtime |
|---|---:|---|
| Oxarion | 8787 | Bun |
| Fastify | 8788 | Bun |
| Koa | 8789 | Bun |

## Endpoints

| Endpoint | Route | Notes |
|---|---|---|
| Health Check | `/health` | Plain text minimal path |
| JSON Response | `/json` | Static JSON serialization |
| Text Response | `/text` | Plain text response path |
| Dynamic Route | `/echo/123?foo=bar` | Route param + query parsing + JSON response |

## Overall Throughput

| Framework | Health | JSON | Text | Dynamic | Average |
|---|---:|---:|---:|---:|---:|
| Oxarion | 255271 | 241717 | 253042 | 202265 | 238074 |
| Fastify | 192900 | 187713 | 192562 | 167957 | 185283 |
| Koa | 130523 | 127692 | 130671 | 114920 | 125951 |

## Overall Ranking

| Rank | Framework | Average Req/Sec | Relative to Leader | Average Latency | Average P99 | Success Rate |
|---:|---|---:|---:|---:|---:|---:|
| 2 | Oxarion | 238074 | 98.7% | 0.847 ms | 1.299 ms | 100.00% |
| 3 | Fastify | 185283 | 76.8% | 1.082 ms | 1.973 ms | 100.00% |
| 4 | Koa | 125951 | 52.2% | 1.592 ms | 2.825 ms | 100.00% |

## Endpoint Breakdown

### Health Check

| Rank | Framework | Req/Sec | Avg Latency | P50 | P95 | P99 | Fastest | Slowest | Success Rate | Measured Duration |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | Oxarion | 255271 | 0.783 ms | 0.759 ms | 0.945 ms | 1.104 ms | 0.066 ms | 4.980 ms | 100.00% | 30.01s |
| 3 | Fastify | 192900 | 1.036 ms | 0.973 ms | 1.460 ms | 2.009 ms | 0.079 ms | 4.472 ms | 100.00% | 30.00s |
| 4 | Koa | 130523 | 1.532 ms | 1.467 ms | 1.948 ms | 2.605 ms | 0.104 ms | 5.475 ms | 100.00% | 30.00s |

### JSON Response

| Rank | Framework | Req/Sec | Avg Latency | P50 | P95 | P99 | Fastest | Slowest | Success Rate | Measured Duration |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Oxarion | 241717 | 0.827 ms | 0.795 ms | 1.087 ms | 1.256 ms | 0.026 ms | 8.289 ms | 100.00% | 30.01s |
| 3 | Fastify | 187713 | 1.065 ms | 1.000 ms | 1.554 ms | 2.069 ms | 0.040 ms | 4.548 ms | 100.00% | 30.00s |
| 4 | Koa | 127692 | 1.566 ms | 1.476 ms | 2.200 ms | 2.939 ms | 0.084 ms | 6.055 ms | 100.00% | 30.00s |

### Text Response

| Rank | Framework | Req/Sec | Avg Latency | P50 | P95 | P99 | Fastest | Slowest | Success Rate | Measured Duration |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | Oxarion | 253042 | 0.790 ms | 0.755 ms | 1.098 ms | 1.336 ms | 0.059 ms | 6.051 ms | 100.00% | 30.00s |
| 3 | Fastify | 192562 | 1.038 ms | 0.988 ms | 1.422 ms | 1.818 ms | 0.075 ms | 4.708 ms | 100.00% | 30.00s |
| 4 | Koa | 130671 | 1.530 ms | 1.443 ms | 2.151 ms | 2.868 ms | 0.089 ms | 5.351 ms | 100.00% | 30.00s |

### Dynamic Route

| Rank | Framework | Req/Sec | Avg Latency | P50 | P95 | P99 | Fastest | Slowest | Success Rate | Measured Duration |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | Oxarion | 202265 | 0.988 ms | 0.949 ms | 1.367 ms | 1.502 ms | 0.080 ms | 5.538 ms | 100.00% | 30.00s |
| 3 | Fastify | 167957 | 1.190 ms | 1.129 ms | 1.556 ms | 1.995 ms | 0.091 ms | 4.601 ms | 100.00% | 30.00s |
| 4 | Koa | 114920 | 1.740 ms | 1.672 ms | 2.158 ms | 2.889 ms | 0.130 ms | 5.322 ms | 100.00% | 30.00s |

## Notes on Interpretation

- The benchmark now uses a timed run with oha via `-z 30s`.
- Each endpoint is warmed up before measurement.
- Reported values are medians across repeated runs.
- Results still include framework overhead plus route implementation overhead.

## Conclusion

Oxarion ranks first in this run with an average throughput of 238,074 requests per second.

---
Benchmark run on 3/25/2026 using oha.
