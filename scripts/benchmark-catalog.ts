import * as http from 'node:http';

interface LatencySample {
  status: number;
  durationMs: number;
}

interface ApiResponse {
  items?: Array<{ slug?: string }>;
  meta?: { total?: number };
}

interface ScenarioReport {
  name: string;
  count: number;
  min: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  errorCount: number;
  itemsReturned?: number;
  totalAvailable?: number;
}

const BASE_URL = process.env.BENCHMARK_BASE_URL ?? 'http://localhost:3007/api/v1/web/products';
const SHOP_CODE = process.env.BENCHMARK_SHOP_CODE ?? 'MAIN';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]!;
}

async function request(
  path: string,
): Promise<{ status: number; durationMs: number; data?: ApiResponse }> {
  return new Promise((resolve) => {
    const url = `${BASE_URL}${path}`;
    const start = performance.now();
    const req = http.get(
      url,
      {
        headers: {
          'x-shop-code': SHOP_CODE,
          Accept: 'application/json',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += String(chunk)));
        res.on('end', () => {
          const durationMs = performance.now() - start;
          let parsed: ApiResponse | undefined;
          try {
            parsed = JSON.parse(body) as ApiResponse;
          } catch {
            // Non JSON
          }
          resolve({ status: res.statusCode ?? 0, durationMs, data: parsed });
        });
      },
    );
    req.on('error', () => {
      const durationMs = performance.now() - start;
      resolve({ status: 500, durationMs });
    });
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

async function runScenario(name: string, path: string, iterations = 20): Promise<ScenarioReport> {
  const samples: LatencySample[] = [];
  let itemsReturned = 0;
  let totalAvailable = 0;

  // Warm-up 2 requests
  await request(path);
  await request(path);

  for (let i = 0; i < iterations; i++) {
    const res = await request(path);
    samples.push({ status: res.status, durationMs: res.durationMs });
    if (res.data?.items) {
      itemsReturned = res.data.items.length;
      totalAvailable = res.data.meta?.total ?? 0;
    }
  }

  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const errorCount = samples.filter((s) => s.status >= 400).length;
  const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;

  return {
    name,
    count: iterations,
    min: Number(durations[0]!.toFixed(1)),
    avg: Number(avg.toFixed(1)),
    p50: Number(percentile(durations, 50).toFixed(1)),
    p95: Number(percentile(durations, 95).toFixed(1)),
    p99: Number(percentile(durations, 99).toFixed(1)),
    max: Number(durations[durations.length - 1]!.toFixed(1)),
    errorCount,
    itemsReturned,
    totalAvailable,
  };
}

async function runConcurrentMix(
  scenarios: Array<{ path: string; weight: number }>,
  totalRequests = 100,
  concurrency = 10,
): Promise<{
  total: number;
  durationMs: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  errors: number;
}> {
  // Build request queue based on weights
  const queue: string[] = [];
  for (let i = 0; i < totalRequests; i++) {
    const rand = Math.random();
    let cumulative = 0;
    for (const sc of scenarios) {
      cumulative += sc.weight;
      if (rand <= cumulative) {
        queue.push(sc.path);
        break;
      }
    }
  }

  const results: LatencySample[] = [];
  const startOverall = performance.now();

  let queueIdx = 0;
  async function worker() {
    while (queueIdx < queue.length) {
      const idx = queueIdx++;
      if (idx >= queue.length) break;
      const path = queue[idx]!;
      const res = await request(path);
      results.push({ status: res.status, durationMs: res.durationMs });
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const totalTimeMs = performance.now() - startOverall;
  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const errors = results.filter((r) => r.status >= 400).length;
  const rps = totalRequests / (totalTimeMs / 1000);

  return {
    total: results.length,
    durationMs: Number(totalTimeMs.toFixed(1)),
    rps: Number(rps.toFixed(1)),
    p50: Number(percentile(durations, 50).toFixed(1)),
    p95: Number(percentile(durations, 95).toFixed(1)),
    p99: Number(percentile(durations, 99).toFixed(1)),
    errors,
  };
}

async function main() {
  console.log(`=======================================================`);
  console.log(`  Catalog Performance Benchmark & Load Test           `);
  console.log(`  Target: ${BASE_URL} (Shop: ${SHOP_CODE})            `);
  console.log(`=======================================================\n`);

  // First verify backend is reachable and get a sample product slug
  const probe = await request('?page=1&limit=5');
  if (probe.status !== 200) {
    console.error(`Backend unreachable at ${BASE_URL} (status: ${probe.status})`);
    process.exit(1);
  }

  const sampleSlug = probe.data?.items?.[0]?.slug ?? 'dam-trang-dai-kin';
  const totalProducts = probe.data?.meta?.total ?? 0;
  console.log(`Database connected: ${totalProducts} rentable active products found.`);
  console.log(`Sample slug for detail queries: "${sampleSlug}"\n`);

  const scenarios = [
    { name: '1. List Default (Page 1)', path: '?page=1&limit=20' },
    { name: '2. List Deep Page (Page 20)', path: '?page=20&limit=20' },
    { name: '3. Price Ascending', path: '?sort=price_asc&page=1&limit=20' },
    { name: '4. Price Descending', path: '?sort=price_desc&page=1&limit=20' },
    { name: '5. Category Filter', path: '?category=vay&limit=20' },
    { name: '6. Text Search ("dam")', path: `?q=${encodeURIComponent('dam')}&limit=20` },
    { name: '7. Size Filter ("S")', path: '?size=S&limit=20' },
    { name: '8. Product Detail', path: `/${encodeURIComponent(sampleSlug)}` },
  ];

  console.log(`Running individual endpoint benchmarks (20 iterations each)...\n`);
  const reports: ScenarioReport[] = [];

  for (const sc of scenarios) {
    process.stdout.write(`  Benchmarking: ${sc.name}... `);
    const report = await runScenario(sc.name, sc.path, 20);
    reports.push(report);
    console.log(
      `avg: ${report.avg}ms | p50: ${report.p50}ms | p95: ${report.p95}ms | p99: ${report.p99}ms | errors: ${report.errorCount}`,
    );
  }

  console.log(`\n================ Individual Endpoint Results ================`);
  console.table(
    reports.map((r) => ({
      Scenario: r.name,
      Min_ms: r.min,
      Avg_ms: r.avg,
      P50_ms: r.p50,
      P95_ms: r.p95,
      P99_ms: r.p99,
      Max_ms: r.max,
      Total_Matching: r.totalAvailable ?? 0,
      Errors: r.errorCount,
    })),
  );

  console.log(`\nRunning concurrent load test (100 requests, 10 concurrent workers)...`);
  const trafficMix = [
    { path: '?page=1&limit=20', weight: 0.6 }, // 60% default list
    { path: `?q=${encodeURIComponent('dam')}&limit=20`, weight: 0.1 }, // 10% search
    { path: '?category=vay&limit=20', weight: 0.1 }, // 10% category
    { path: `/${encodeURIComponent(sampleSlug)}`, weight: 0.15 }, // 15% detail
    { path: '?sort=price_asc&page=1&limit=20', weight: 0.05 }, // 5% price sort
  ];

  const loadResult = await runConcurrentMix(trafficMix, 100, 10);
  console.log(`Load Test Result:`);
  console.log(`  Total Requests:  ${loadResult.total}`);
  console.log(`  Throughput:      ${loadResult.rps} req/sec`);
  console.log(`  Total Duration:  ${loadResult.durationMs}ms`);
  console.log(`  p50 Latency:     ${loadResult.p50}ms`);
  console.log(`  p95 Latency:     ${loadResult.p95}ms`);
  console.log(`  p99 Latency:     ${loadResult.p99}ms`);
  console.log(`  Errors:          ${loadResult.errors}`);
  console.log(`=============================================================\n`);
}

main().catch(console.error);
