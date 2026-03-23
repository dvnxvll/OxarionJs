# Testing And Benchmarking

## Bun Test Naming Rule

Bun only picks files with these patterns

- `*.test.ts`
- `*.spec.ts`
- `*_test_*.ts`
- `*_spec_*.ts`

## Run Tests

```bash
bun test
```

## Type Check

```bash
bunx tsc --noEmit
```

## Basic oha Benchmark

```bash
oha -z 20s -c 100 http://127.0.0.1:3000/
```

## Dynamic Route Benchmark

```bash
oha -z 20s -c 100 http://127.0.0.1:3000/test
```

## Useful Benchmark Tips

- Warm up first with one short run
- Compare with same payload and same machine state
- Disable debug logs for realistic throughput
- Track p50, p95, p99 and error rate
