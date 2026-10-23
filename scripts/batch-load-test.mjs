#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'os';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../packages/engine/bin/unit-verify.mjs');

async function runBatchBenchmark(targetRows) {
  const startTime = Date.now();
  let peakRss = 0;
  let outputRows = 0;

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [CLI_PATH, 'batch', '--format', 'ndjson', '--max-records', String(targetRows)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Sample RSS of the child process periodically
    const rssSampler = setInterval(() => {
      try {
        const mem = process.memoryUsage();
        if (mem.rss > peakRss) {
          peakRss = mem.rss;
        }
      } catch {
        // ignore
      }
    }, 50);

    let stdoutRemainder = '';

    proc.stdout.on('data', (chunk) => {
      const text = stdoutRemainder + chunk.toString('utf8');
      const lines = text.split('\n');
      stdoutRemainder = lines.pop(); // keep last incomplete line
      outputRows += lines.length;
    });

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });

    proc.on('close', (code) => {
      clearInterval(rssSampler);
      if (stdoutRemainder.trim().length > 0) {
        outputRows++;
      }
      const elapsedMs = Date.now() - startTime;
      resolve({
        targetRows,
        outputRows,
        code,
        elapsedMs,
        peakRssMb: (peakRss / (1024 * 1024)).toFixed(2),
        stderr: stderr.trim(),
      });
    });

    proc.on('error', (err) => {
      clearInterval(rssSampler);
      reject(err);
    });

    // Stream rows into child stdin with backpressure
    let written = 0;
    function writeMore() {
      let ok = true;
      while (written < targetRows && ok) {
        written++;
        const line = JSON.stringify({ id: `item-${written}`, value: written, from: 'ft', to: 'm' }) + '\n';
        ok = proc.stdin.write(line);
      }
      if (written < targetRows) {
        proc.stdin.once('drain', writeMore);
      } else {
        proc.stdin.end();
      }
    }

    writeMore();
  });
}

async function main() {
  console.log('====================================================');
  console.log(' RaxoCode Unit Verify - Streaming Batch Load Test   ');
  console.log('====================================================');
  console.log(`Node:    ${process.version} (${process.arch})`);
  console.log(`OS:      ${os.type()} ${os.release()}`);
  console.log(`CPUs:    ${os.cpus().length}x ${os.cpus()[0]?.model || 'CPU'}`);
  console.log(`Memory:  ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log('----------------------------------------------------');

  const tiers = [1_000, 10_000, 100_000];
  const results = [];

  for (const tier of tiers) {
    process.stdout.write(`Benchmarking ${tier.toLocaleString()} streaming rows... `);
    const res = await runBatchBenchmark(tier);
    console.log(`DONE in ${res.elapsedMs}ms (exit code: ${res.code}, output rows: ${res.outputRows})`);
    results.push(res);
  }

  console.log('----------------------------------------------------');
  console.log('Summary:');
  for (const r of results) {
    const rate = Math.round((r.outputRows / (r.elapsedMs / 1000)));
    console.log(`- ${r.targetRows.toLocaleString().padStart(7)} rows: ${r.elapsedMs.toString().padStart(5)} ms (~${rate.toLocaleString().padStart(7)} rows/s), exit: ${r.code}`);
  }
  console.log('====================================================');

  // Assertions
  for (const r of results) {
    if (r.code !== 0 || r.outputRows !== r.targetRows) {
      console.error(`Benchmark failed on tier ${r.targetRows}: exit ${r.code}, expected ${r.targetRows} rows, got ${r.outputRows}`);
      process.exit(1);
    }
  }

  console.log('All scaling load tests PASSED with 0 errors.');
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
