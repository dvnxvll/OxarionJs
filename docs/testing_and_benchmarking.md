# Testing and Benchmarking

## Benchmark suite

The benchmark runner lives in the `benchmark` directory.

- Runner: `benchmark/run-benchmark.ts`
- Output: `benchmark/Results.md`

## Install `oha`

The benchmark runner depends on [`oha`](https://github.com/hatoo/oha), a small HTTP load generator used for timed throughput and latency testing.

Install it before running the benchmark suite.

### macOS

```bash
brew install oha
```

### Cargo

```bash
cargo install oha
```

### Arch Linux

```bash
sudo pacman -S oha
```

### Other installation options

See the official repository for additional install methods and releases:

- [`oha` on GitHub](https://github.com/hatoo/oha)

You can verify that it is installed with:

```bash
oha --version
```

## Run the full benchmark suite

```bash
bun run benchmark/run-benchmark.ts
```

## What the benchmark covers

The current benchmark suite compares the same set of endpoints across all tested frameworks:

- `/health` — minimal plain text response
- `/json` — static JSON response
- `/text` — plain text response
- `/echo/:id?foo=bar` — dynamic route with route param and query parsing

## Benchmark method

The runner uses `oha` with timed execution and repeated runs.

Current benchmark shape:

- warmup run before measurement
- sustained timed benchmark runs
- multiple measured runs per endpoint
- median used for the reported endpoint result

This makes the results more stable than a single burst run.

## Reproducing a manual benchmark

Basic timed run:

```bash
oha -z 30s -c 200 http://127.0.0.1:3000/
```

Dynamic route example:

```bash
oha -z 30s -c 200 http://127.0.0.1:3000/echo/123?foo=bar
```

## Reading the results

The generated benchmark report is written to:

```text
benchmark/Results.md
```

The report includes:

- overall throughput by framework
- endpoint-by-endpoint breakdown
- average throughput summary
- average latency and p99 latency
- measured duration and success rate

## Benchmarking notes

- Warm up first before measured runs
- Keep handlers implementation-equivalent when comparing frameworks
- Use the same payload, route shape, and headers across frameworks
- Disable debug logging during measurement
- Avoid background apps and other heavy activity while benchmarking
- Watch p50, p95, p99, throughput, and error rate together
- Prefer repeated timed runs over a single short benchmark

## Notes on fairness

Framework benchmarks are only useful when each framework is doing the same work.

If one implementation performs extra JSON construction, different header handling, additional async overhead, or different route parsing work, the result reflects application differences as much as framework overhead.

For the fairest comparison:

- use identical payloads
- use identical route behavior
- use identical status codes and headers
- avoid extra logging or per-request work in only one implementation

## Suggested workflow

1. Install `oha`
2. Run tests
3. Run type checks
4. Run the benchmark suite
5. Compare the generated `benchmark/Results.md`
6. Repeat on a quiet machine state before drawing conclusions
