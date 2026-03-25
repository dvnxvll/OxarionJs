#!/usr/bin/env bun

interface BenchmarkResult {
  framework: string;
  port: number;
  endpoint: string;
  requestsPerSec: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  fastestMs: number;
  slowestMs: number;
  successRate: number;
  totalRequests: number;
  totalDataBytes: number;
  measuredDurationSeconds: number;
  runs: number;
}

interface RawRunResult {
  requestsPerSec: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  fastestMs: number;
  slowestMs: number;
  successRate: number;
  totalRequests: number;
  totalDataBytes: number;
  measuredDurationSeconds: number;
}

interface FrameworkConfig {
  name: string;
  port: number;
  file: string;
}

interface EndpointConfig {
  path: string;
  name: string;
  notes: string;
}

type OhaJson = {
  summary?: {
    successRate?: number;
    total?: number;
    slowest?: number;
    fastest?: number;
    average?: number;
    requestsPerSec?: number;
    totalData?: number;
  };
  latencyPercentiles?: {
    p50?: number;
    p95?: number;
    p99?: number;
  };
};

const FRAMEWORKS: FrameworkConfig[] = [
  { name: "Oxarion", port: 8787, file: "servers/oxarion.ts" },
  { name: "Fastify", port: 8788, file: "servers/fastify.ts" },
  { name: "Koa", port: 8789, file: "servers/koa.ts" },
];

const ENDPOINTS: EndpointConfig[] = [
  { path: "/health", name: "Health Check", notes: "Plain text minimal path" },
  { path: "/json", name: "JSON Response", notes: "Static JSON serialization" },
  { path: "/text", name: "Text Response", notes: "Plain text response path" },
  {
    path: "/echo/123?foo=bar",
    name: "Dynamic Route",
    notes: "Route param + query parsing + JSON response",
  },
];

const CONCURRENCY = 200;
const DURATION_SECONDS = 30;
const WARMUP_SECONDS = 5;
const RUNS_PER_ENDPOINT = 5;
const SERVER_START_TIMEOUT_MS = 15_000;
const SERVER_STABILIZE_MS = 1_000;
const BETWEEN_RUNS_DELAY_MS = 300;
const BETWEEN_FRAMEWORKS_DELAY_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function formatInt(value: number): string {
  return value.toFixed(0);
}

function formatMs(value: number): string {
  return `${value.toFixed(3)} ms`;
}

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function toMs(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value * 1000;
}

async function waitForServer(port: number): Promise<boolean> {
  const started = Date.now();

  while (Date.now() - started < SERVER_START_TIMEOUT_MS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // ignore until ready
    }

    await sleep(250);
  }

  return false;
}

async function startServer(
  framework: FrameworkConfig,
): Promise<Bun.Subprocess> {
  console.log(`Starting ${framework.name} on port ${framework.port}...`);

  const proc = Bun.spawn(["bun", "run", framework.file], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const ready = await waitForServer(framework.port);
  if (!ready) {
    const stderr = await proc.stderr.text().catch(() => "");
    try {
      proc.kill();
    } catch {}
    throw new Error(
      `${framework.name} failed to become ready on port ${framework.port}\n${stderr}`,
    );
  }

  await sleep(SERVER_STABILIZE_MS);
  console.log(`${framework.name} is ready`);
  return proc;
}

function stopServer(proc: Bun.Subprocess): void {
  try {
    proc.kill();
  } catch {}
}

function parseOhaJson(jsonText: string): RawRunResult {
  const parsed = JSON.parse(jsonText) as OhaJson;
  const summary = parsed.summary ?? {};
  const p = parsed.latencyPercentiles ?? {};
  const successRateFraction = summary.successRate ?? 0;
  const duration = summary.total ?? 0;
  const rps = summary.requestsPerSec ?? 0;

  // console.log(JSON.stringify(parsed, null, 2));

  return {
    requestsPerSec: rps,
    avgLatencyMs: toMs(summary.average),
    p50LatencyMs: toMs(p.p50),
    p95LatencyMs: toMs(p.p95),
    p99LatencyMs: toMs(p.p99),
    fastestMs: toMs(summary.fastest),
    slowestMs: toMs(summary.slowest),
    successRate: successRateFraction * 100,
    totalRequests: Math.round(rps * duration),
    totalDataBytes: summary.totalData ?? 0,
    measuredDurationSeconds: duration,
  };
}

async function runOha(
  port: number,
  endpoint: string,
  durationSeconds: number,
): Promise<RawRunResult> {
  const url = `http://127.0.0.1:${port}${endpoint}`;

  const proc = Bun.spawn(
    [
      "oha",
      "-c",
      String(CONCURRENCY),
      "-z",
      `${durationSeconds}s`,
      "--no-tui",
      "--output-format",
      "json",
      url,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const exitCode = await proc.exited;
  const stdout = await proc.stdout.text();
  const stderr = await proc.stderr.text();

  if (exitCode !== 0) {
    throw new Error(
      `oha exited with code ${exitCode} for ${url}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
    );
  }

  return parseOhaJson(stdout);
}

async function warmupEndpoint(port: number, endpoint: string): Promise<void> {
  await runOha(port, endpoint, WARMUP_SECONDS);
}

function aggregateRuns(
  framework: string,
  port: number,
  endpoint: string,
  runs: RawRunResult[],
): BenchmarkResult {
  return {
    framework,
    port,
    endpoint,
    requestsPerSec: median(runs.map((r) => r.requestsPerSec)),
    avgLatencyMs: median(runs.map((r) => r.avgLatencyMs)),
    p50LatencyMs: median(runs.map((r) => r.p50LatencyMs)),
    p95LatencyMs: median(runs.map((r) => r.p95LatencyMs)),
    p99LatencyMs: median(runs.map((r) => r.p99LatencyMs)),
    fastestMs: median(runs.map((r) => r.fastestMs)),
    slowestMs: median(runs.map((r) => r.slowestMs)),
    successRate: median(runs.map((r) => r.successRate)),
    totalRequests: Math.round(median(runs.map((r) => r.totalRequests))),
    totalDataBytes: Math.round(median(runs.map((r) => r.totalDataBytes))),
    measuredDurationSeconds: median(runs.map((r) => r.measuredDurationSeconds)),
    runs: runs.length,
  };
}

async function benchmarkFramework(
  framework: FrameworkConfig,
): Promise<BenchmarkResult[]> {
  console.log(`\nBenchmarking ${framework.name}`);
  const proc = await startServer(framework);

  try {
    const results: BenchmarkResult[] = [];

    for (const endpoint of ENDPOINTS) {
      console.log(`  ${endpoint.name}`);
      console.log(`    Warmup: ${WARMUP_SECONDS}s`);
      await warmupEndpoint(framework.port, endpoint.path);
      await sleep(BETWEEN_RUNS_DELAY_MS);

      const samples: RawRunResult[] = [];

      for (let i = 0; i < RUNS_PER_ENDPOINT; i++) {
        process.stdout.write(`    Run ${i + 1}/${RUNS_PER_ENDPOINT}... `);

        const result = await runOha(
          framework.port,
          endpoint.path,
          DURATION_SECONDS,
        );
        samples.push(result);

        console.log(
          `${formatInt(result.requestsPerSec)} req/sec, ` +
            `${formatMs(result.avgLatencyMs)} avg, ` +
            `${formatMs(result.p99LatencyMs)} p99, ` +
            `${result.measuredDurationSeconds.toFixed(2)}s measured`,
        );

        await sleep(BETWEEN_RUNS_DELAY_MS);
      }

      const aggregated = aggregateRuns(
        framework.name,
        framework.port,
        endpoint.name,
        samples,
      );

      console.log(
        `    Median: ${formatInt(aggregated.requestsPerSec)} req/sec, ` +
          `${formatMs(aggregated.avgLatencyMs)} avg, ` +
          `${formatMs(aggregated.p99LatencyMs)} p99`,
      );

      results.push(aggregated);
    }

    return results;
  } finally {
    stopServer(proc);
    await sleep(BETWEEN_FRAMEWORKS_DELAY_MS);
  }
}

function generateMarkdown(results: BenchmarkResult[]): string {
  const now = new Date().toISOString();

  const byFramework = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!byFramework.has(r.framework)) byFramework.set(r.framework, []);
    byFramework.get(r.framework)!.push(r);
  }

  const averages = FRAMEWORKS.map((f) => {
    const rows = byFramework.get(f.name) ?? [];
    return {
      framework: f.name,
      port: f.port,
      avgReq: mean(rows.map((r) => r.requestsPerSec)),
      avgLatency: mean(rows.map((r) => r.avgLatencyMs)),
      avgP99: mean(rows.map((r) => r.p99LatencyMs)),
      avgSuccessRate: mean(rows.map((r) => r.successRate)),
    };
  }).sort((a, b) => b.avgReq - a.avgReq);

  const leader = averages[0];

  let md = "";

  md += `# Framework Benchmark Results\n\n`;
  md += `Generated: ${now}\n\n`;

  md += `## Test Configuration\n\n`;
  md += `- Concurrency: ${CONCURRENCY} connections\n`;
  md += `- Measured duration per run: ${DURATION_SECONDS} seconds\n`;
  md += `- Warmup duration per endpoint: ${WARMUP_SECONDS} seconds\n`;
  md += `- Runs per endpoint: ${RUNS_PER_ENDPOINT}\n`;
  md += `- Aggregation: median of measured runs\n`;
  md += `- Runtime: Bun ${Bun.version}\n`;
  md += `- Tool: oha\n\n`;

  md += `## Frameworks Tested\n\n`;
  md += `| Framework | Port | Runtime |\n`;
  md += `|---|---:|---|\n`;
  for (const f of FRAMEWORKS) {
    md += `| ${f.name} | ${f.port} | Bun |\n`;
  }
  md += `\n`;

  md += `## Endpoints\n\n`;
  md += `| Endpoint | Route | Notes |\n`;
  md += `|---|---|---|\n`;
  for (const ep of ENDPOINTS) {
    md += `| ${ep.name} | \`${ep.path}\` | ${ep.notes} |\n`;
  }
  md += `\n`;

  md += `## Overall Throughput\n\n`;
  md += `| Framework | Health | JSON | Text | Dynamic | Average |\n`;
  md += `|---|---:|---:|---:|---:|---:|\n`;

  for (const f of FRAMEWORKS) {
    const rows = byFramework.get(f.name) ?? [];
    const health =
      rows.find((r) => r.endpoint === "Health Check")?.requestsPerSec ?? 0;
    const json =
      rows.find((r) => r.endpoint === "JSON Response")?.requestsPerSec ?? 0;
    const text =
      rows.find((r) => r.endpoint === "Text Response")?.requestsPerSec ?? 0;
    const dynamic =
      rows.find((r) => r.endpoint === "Dynamic Route")?.requestsPerSec ?? 0;
    const avg = mean([health, json, text, dynamic]);

    md += `| ${f.name} | ${formatInt(health)} | ${formatInt(json)} | ${formatInt(text)} | ${formatInt(dynamic)} | ${formatInt(avg)} |\n`;
  }
  md += `\n`;

  md += `## Overall Ranking\n\n`;
  md += `| Rank | Framework | Average Req/Sec | Relative to Leader | Average Latency | Average P99 | Success Rate |\n`;
  md += `|---:|---|---:|---:|---:|---:|---:|\n`;

  averages.forEach((row, index) => {
    const relative = leader.avgReq > 0 ? (row.avgReq / leader.avgReq) * 100 : 0;
    md += `| ${index + 1} | ${row.framework} | ${formatInt(row.avgReq)} | ${relative.toFixed(1)}% | ${formatMs(row.avgLatency)} | ${formatMs(row.avgP99)} | ${formatPct(row.avgSuccessRate)} |\n`;
  });
  md += `\n`;

  md += `## Endpoint Breakdown\n\n`;

  for (const ep of ENDPOINTS) {
    const rows = results
      .filter((r) => r.endpoint === ep.name)
      .sort((a, b) => b.requestsPerSec - a.requestsPerSec);

    md += `### ${ep.name}\n\n`;
    md += `| Rank | Framework | Req/Sec | Avg Latency | P50 | P95 | P99 | Fastest | Slowest | Success Rate | Measured Duration |\n`;
    md += `|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      md += `| ${i + 1} | ${r.framework} | ${formatInt(r.requestsPerSec)} | ${formatMs(r.avgLatencyMs)} | ${formatMs(r.p50LatencyMs)} | ${formatMs(r.p95LatencyMs)} | ${formatMs(r.p99LatencyMs)} | ${formatMs(r.fastestMs)} | ${formatMs(r.slowestMs)} | ${formatPct(r.successRate)} | ${r.measuredDurationSeconds.toFixed(2)}s |\n`;
    }

    md += `\n`;
  }

  md += `## Notes on Interpretation\n\n`;
  md += `- The benchmark now uses a timed run with oha via \`-z ${DURATION_SECONDS}s\`.\n`;
  md += `- Each endpoint is warmed up before measurement.\n`;
  md += `- Reported values are medians across repeated runs.\n`;
  md += `- Results still include framework overhead plus route implementation overhead.\n\n`;

  md += `## Conclusion\n\n`;
  md += `${leader.framework} ranks first in this run with an average throughput of ${formatInt(leader.avgReq)} requests per second.\n\n`;

  md += `---\n`;
  md += `Benchmark run on ${new Date().toLocaleDateString()} using oha.\n`;

  return md;
}

async function main(): Promise<void> {
  console.log("Framework benchmark");
  console.log(
    `Configuration: ${CONCURRENCY} concurrent, ${DURATION_SECONDS}s measured, ${WARMUP_SECONDS}s warmup, ${RUNS_PER_ENDPOINT} runs per endpoint\n`,
  );

  const allResults: BenchmarkResult[] = [];

  for (const framework of FRAMEWORKS) {
    const results = await benchmarkFramework(framework);
    allResults.push(...results);
  }

  console.log("\nGenerating results...\n");

  const markdown = generateMarkdown(allResults);
  const outputPath = `${import.meta.dir}/Results.md`;
  await Bun.write(outputPath, markdown);

  console.log(`Results saved to ${outputPath}\n`);

  const ranking = FRAMEWORKS.map((framework) => {
    const rows = allResults.filter((r) => r.framework === framework.name);
    return {
      name: framework.name,
      avgReqPerSec: mean(rows.map((r) => r.requestsPerSec)),
    };
  }).sort((a, b) => b.avgReqPerSec - a.avgReqPerSec);

  console.log("Final ranking:\n");
  ranking.forEach((row, index) => {
    console.log(
      `  ${index + 1}. ${row.name}: ${formatInt(row.avgReqPerSec)} req/sec`,
    );
  });

  console.log("\nBenchmark complete.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
