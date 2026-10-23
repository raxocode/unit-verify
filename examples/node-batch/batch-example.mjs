#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../../packages/engine/bin/unit-verify.mjs');

console.log('Streaming sample NDJSON records through unit-verify CLI...\n');

const sampleRecords = [
  { id: 'rec-001', value: 125, from: 'ft', to: 'm' },
  { id: 'rec-002', value: 1, from: 'ton_us', to: 'kg' },
  { id: 'rec-003', value: 12, from: 'ton', to: 'kg' }, // Ambiguous!
  { id: 'rec-004', value: 100, from: 'degC', to: 'degF' },
  { id: 'rec-005', value: 50, from: 'kN', to: 'kg' },  // Dimension mismatch!
];

const proc = spawn(process.execPath, [CLI_PATH, 'batch', '--format', 'ndjson'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

proc.stdout.on('data', (data) => {
  const lines = data.toString('utf8').trim().split('\n');
  for (const line of lines) {
    const item = JSON.parse(line);
    if (item.ok) {
      console.log(`✓ Line ${item.line} [${item.id}]: ${item.input.value} ${item.input.from} -> ${item.result} ${item.unit}`);
    } else {
      console.log(`✗ Line ${item.line} [${item.id}]: ${item.code} - ${item.message}`);
    }
  }
});

for (const rec of sampleRecords) {
  proc.stdin.write(JSON.stringify(rec) + '\n');
}
proc.stdin.end();

proc.on('close', (code) => {
  console.log(`\nBatch CLI process completed with exit code: ${code}`);
});
