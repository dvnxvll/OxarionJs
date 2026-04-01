#!/usr/bin/env bun

import Oxarion, { Middleware } from "../src";
import { mkdir, writeFile } from "fs/promises";
import { join, resolve } from "path";

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

type Result = {
  endpoint: string;
  requestsPerSec: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  successRate: number;
};

type BenchmarkEndpoint = {
  label: string;
  path: string;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
};

const PORT = Number(Bun.env.OX_BENCH_PORT || 9192);
const CONCURRENCY = Number(Bun.env.OX_BENCH_CONCURRENCY || 200);
const WARMUP_SECONDS = Number(Bun.env.OX_BENCH_WARMUP || 3);
const DURATION_SECONDS = Number(Bun.env.OX_BENCH_DURATION || 10);
const OUT_FILE = resolve(process.cwd(), "benchmarks/OxRuntimeResults.md");
const templates_root = resolve(process.cwd(), "benchmarks/templates");
const pages_dir = join(templates_root, "pages");
const fragments_dir = join(templates_root, "fragments");

const to_ms = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value * 1000 : 0;

const parse_oha_json = (json_text: string): Result => {
  const parsed = JSON.parse(json_text) as OhaJson;
  const summary = parsed.summary ?? {};
  const percentiles = parsed.latencyPercentiles ?? {};

  return {
    endpoint: "",
    requestsPerSec: summary.requestsPerSec ?? 0,
    avgLatencyMs: to_ms(summary.average),
    p95LatencyMs: to_ms(percentiles.p95),
    p99LatencyMs: to_ms(percentiles.p99),
    successRate: (summary.successRate ?? 0) * 100,
  };
};

const run_oha = async (
  url: string,
  seconds: number,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<Result> => {
  const args = [
    "oha",
    "-c",
    String(CONCURRENCY),
    "-z",
    `${seconds}s`,
    "--no-tui",
    "--output-format",
    "json",
  ];

  if (options.method && options.method !== "GET") {
    args.push("-m", options.method);
  }
  if (options.body !== undefined) {
    args.push("-d", options.body);
  }
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers))
      args.push("-H", `${key}: ${value}`);
  }
  args.push(url);

  const proc = Bun.spawn(
    args,
    {
      stdout: "pipe",
      stderr: "pipe",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key !== "NO_COLOR"),
      ),
    },
  );

  const exit = await proc.exited;
  const stdout = await proc.stdout.text();
  const stderr = await proc.stderr.text();

  if (exit !== 0) {
    throw new Error(
      `oha exited with code ${exit} for ${url}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`,
    );
  }

  return parse_oha_json(stdout);
};

const format_row = (label: string, result: Result) =>
  `| ${label} | ${result.requestsPerSec.toFixed(2)} | ${result.avgLatencyMs.toFixed(3)} ms | ${result.p95LatencyMs.toFixed(3)} ms | ${result.p99LatencyMs.toFixed(3)} ms | ${result.successRate.toFixed(2)}% |`;

await mkdir(pages_dir, { recursive: true });
await mkdir(fragments_dir, { recursive: true });

let runtime_path = "/__oxarion/ox.js";
let csrf_token = "";
let cookie_header = "";

const app = Oxarion.create({
  checkLatestVersion: false,
  template: {
    pagesDir: pages_dir,
    fragmentsDir: fragments_dir,
    cache: true,
  },
  cachePages: true,
  httpHandler: (router) => {
    runtime_path = router.serveOx();

    router.addHandler("GET", "/health", (_req, res) => res.text("ok"));
    router.addHandler("GET", "/bench/session", (req, res) => {
      csrf_token = req.getCsrfToken() || "";
      const count = Number(req.getSessionValue("count") || 0);
      return res.render("ssr", {
        title: "Oxarion SSR Benchmark",
        value: count,
        csrfToken: csrf_token,
        oxScriptPath: runtime_path,
      });
    });
    router.addHandler("POST", "/bench/session/increment", (req, res) => {
      const count = Number(req.getSessionValue("count") || 0) + 1;
      req.setSessionValue("count", count);
      return res.renderFragment("stats", { value: count });
    });
    router.addHandler("GET", "/ssr", (_req, res) =>
      res.render("ssr", {
        title: "Oxarion SSR Benchmark",
        value: 42,
        csrfToken: "bench-token",
        oxScriptPath: runtime_path,
      }),
    );
    router.addHandler("GET", "/fragment", (_req, res) =>
      res.renderFragment("stats", { value: 42 }),
    );
  },
  safeMwRegister: (router) => {
    router.multiMiddleware(
      "/bench",
      [Middleware.session({ cookieName: "bench_sid" }), Middleware.csrf()],
      true,
    );
  },
});

await app.start({ host: "127.0.0.1", port: PORT });

const seed = await fetch(`http://127.0.0.1:${PORT}/bench/session`);
csrf_token = seed.headers.get("x-ox-csrf") || "";
const seed_cookies =
  (seed.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
  [];
cookie_header = seed_cookies
  .map((line) => line.split(";", 1)[0])
  .join("; ");

const endpoints: BenchmarkEndpoint[] = [
  { label: "Health", path: "/health" },
  { label: "SSR Page", path: "/ssr" },
  { label: "Fragment", path: "/fragment" },
  { label: "Ox Runtime", path: runtime_path },
  {
    label: "Session Fragment POST",
    path: "/bench/session/increment",
    method: "POST",
    body: "",
    headers: {
      cookie: cookie_header,
      "x-ox-csrf": csrf_token,
    },
  },
];

const results: Array<{ label: string; result: Result }> = [];

try {
  for (const endpoint of endpoints) {
    const url = `http://127.0.0.1:${PORT}${endpoint.path}`;
    await run_oha(url, WARMUP_SECONDS, endpoint);
    const measured = await run_oha(url, DURATION_SECONDS, endpoint);
    measured.endpoint = endpoint.path;
    results.push({ label: endpoint.label, result: measured });
    console.log(
      `${endpoint.label}: ${measured.requestsPerSec.toFixed(2)} req/s, p95 ${measured.p95LatencyMs.toFixed(3)} ms`,
    );
  }
} finally {
  await app.stop();
}

let md = "# Ox SSR Runtime Benchmark\n";
md += "\n";
md += `- concurrency: ${CONCURRENCY}\n`;
md += `- warmup: ${WARMUP_SECONDS}s\n`;
md += `- measured duration: ${DURATION_SECONDS}s\n`;
md += "\n";
md += "| Endpoint | Req/Sec | Avg Latency | P95 | P99 | Success Rate |\n";
md += "| --- | ---: | ---: | ---: | ---: | ---: |\n";
for (const item of results) md += `${format_row(item.label, item.result)}\n`;

await writeFile(OUT_FILE, md, "utf8");
console.log(`wrote ${OUT_FILE}`);
