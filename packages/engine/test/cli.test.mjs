import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../bin/unit-verify.mjs');

function runCli(args, stdinData = '') {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [CLI_PATH, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    proc.stdout.on('data', (d) => {
      stdout += d;
    });
    proc.stderr.on('data', (d) => {
      stderr += d;
    });

    if (stdinData) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('CLI Single Conversion & Subcommands', () => {
  it('--help prints usage and exits 0', async () => {
    const res = await runCli(['--help']);
    assert.equal(res.code, 0);
    assert.ok(res.stdout.includes('RaxoCode Unit Verify'));
    assert.ok(res.stdout.includes('Usage:'));
  });

  it('--version prints version and exits 0', async () => {
    const res = await runCli(['--version']);
    assert.equal(res.code, 0);
    assert.equal(res.stdout.trim(), 'unit-verify 0.1.0');
  });

  it('convert valid values in json mode exits 0 with single JSON object', async () => {
    const res = await runCli(['convert', '--value', '125', '--from', 'ft', '--to', 'm', '--format', 'json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.result, 38.1);
  });

  it('convert valid values in human mode exits 0', async () => {
    const res = await runCli(['convert', '--value', '125', '--from', 'ft', '--to', 'm']);
    assert.equal(res.code, 0);
    assert.ok(res.stdout.includes('125 ft = 38.1 m'));
  });

  it('convert ambiguous unit in json mode exits 2 with structured choices', async () => {
    const res = await runCli(['convert', '--value', '12', '--from', 'ton', '--to', 'kg', '--format', 'json']);
    assert.equal(res.code, 2);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'AMBIGUOUS_UNIT');
    assert.deepEqual(parsed.choices, ['tonne', 'ton_us', 'ton_uk']);
  });

  it('convert dimension mismatch exits 2', async () => {
    const res = await runCli(['convert', '--value', '50', '--from', 'kN', '--to', 'kg', '--format', 'json']);
    assert.equal(res.code, 2);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'DIMENSION_MISMATCH');
  });

  it('convert with invalid flag exits 3 with usage message on stderr', async () => {
    const res = await runCli(['convert', '--bogus-flag']);
    assert.equal(res.code, 3);
    assert.ok(res.stderr.includes('Unknown flag'));
  });

  it('list command in json mode prints catalog with 51 units', async () => {
    const res = await runCli(['list', '--format', 'json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.units.length, 51);
  });

  it('describe command in json mode describes psi correctly', async () => {
    const res = await runCli(['describe', '--unit', 'psi', '--format', 'json']);
    assert.equal(res.code, 0);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.unit.id, 'psi');
    assert.equal(parsed.unit.dimension, 'pressure');
  });
});

describe('Adversarial Streaming Batch CLI Tests', () => {
  it('1. 10 valid rows produce 10 valid NDJSON results with 1-based lines and exit 0', async () => {
    const lines = [];
    for (let i = 1; i <= 10; i++) {
      lines.push(JSON.stringify({ id: `row-${i}`, value: i, from: 'm', to: 'cm' }));
    }
    const input = lines.join('\n') + '\n';
    const res = await runCli(['batch', '--format', 'ndjson'], input);
    assert.equal(res.code, 0);

    const outLines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(outLines.length, 10);
    for (let i = 0; i < 10; i++) {
      assert.equal(outLines[i].line, i + 1);
      assert.equal(outLines[i].id, `row-${i + 1}`);
      assert.equal(outLines[i].ok, true);
      assert.equal(outLines[i].result, (i + 1) * 100);
    }
  });

  it('2. Invalid JSON on row 2 produces exactly one INVALID_JSON error; row 3 completes; exits 2', async () => {
    const input = [
      JSON.stringify({ value: 10, from: 'm', to: 'km' }),
      '{ malformed json !!!',
      JSON.stringify({ value: 20, from: 'm', to: 'km' }),
    ].join('\n') + '\n';

    const res = await runCli(['batch', '--format', 'ndjson'], input);
    assert.equal(res.code, 2);

    const outLines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(outLines.length, 3);
    assert.equal(outLines[0].line, 1);
    assert.equal(outLines[0].ok, true);
    assert.equal(outLines[1].line, 2);
    assert.equal(outLines[1].ok, false);
    assert.equal(outLines[1].code, 'INVALID_JSON');
    assert.equal(outLines[2].line, 3);
    assert.equal(outLines[2].ok, true);
  });

  it('3. Hostile line (>16 KiB) is safely discarded without memory accumulation, emits ROW_TOO_LARGE, resumes next line', async () => {
    const hugeLine = 'a'.repeat(20_000); // Exceeds 16,384 bytes
    const input = [
      JSON.stringify({ value: 1, from: 'm', to: 'cm' }),
      hugeLine,
      JSON.stringify({ value: 2, from: 'm', to: 'cm' }),
    ].join('\n') + '\n';

    const res = await runCli(['batch', '--format', 'ndjson'], input);
    assert.equal(res.code, 2);

    const outLines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(outLines.length, 3);
    assert.equal(outLines[0].ok, true);
    assert.equal(outLines[1].ok, false);
    assert.equal(outLines[1].code, 'ROW_TOO_LARGE');
    assert.equal(outLines[2].ok, true);
  });

  it('4. Exceeding max-records limit stops before processing row over limit and exits 3', async () => {
    const lines = [];
    for (let i = 1; i <= 6; i++) {
      lines.push(JSON.stringify({ value: i, from: 'm', to: 'km' }));
    }
    const input = lines.join('\n') + '\n';
    const res = await runCli(['batch', '--format', 'ndjson', '--max-records', '5'], input);
    assert.equal(res.code, 3);
    assert.ok(res.stderr.includes('BATCH_LIMIT'));

    // Output should only contain the 5 allowed rows
    const outLines = res.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.equal(outLines.length, 5);
  });

  it('5. --max-records 100001 is rejected before reading input with exit 3', async () => {
    const res = await runCli(['batch', '--format', 'ndjson', '--max-records', '100001'], '');
    assert.equal(res.code, 3);
    assert.ok(res.stderr.includes('must be an integer between 1 and 100000'));
  });

  it('6. Empty lines are counted and reported as INVALID_ROW', async () => {
    const input = [
      JSON.stringify({ value: 1, from: 'm', to: 'km' }),
      '',
      JSON.stringify({ value: 2, from: 'm', to: 'km' }),
    ].join('\n') + '\n';

    const res = await runCli(['batch', '--format', 'ndjson'], input);
    assert.equal(res.code, 2);

    const outLines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(outLines.length, 3);
    assert.equal(outLines[1].code, 'INVALID_ROW');
  });

  it('7. Malformed UTF-8 emits INVALID_ROW and continues', async () => {
    const validRow1 = Buffer.from(JSON.stringify({ value: 1, from: 'm', to: 'km' }) + '\n');
    const badUtf8 = Buffer.from([0xff, 0xfe, 0x0a]); // Invalid UTF-8 followed by newline
    const validRow2 = Buffer.from(JSON.stringify({ value: 2, from: 'm', to: 'km' }) + '\n');
    const combined = Buffer.concat([validRow1, badUtf8, validRow2]);

    const res = await new Promise((resolve) => {
      const proc = spawn(process.execPath, [CLI_PATH, 'batch', '--format', 'ndjson']);
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => (stdout += d));
      proc.stderr.on('data', (d) => (stderr += d));
      proc.stdin.write(combined);
      proc.stdin.end();
      proc.on('close', (code) => resolve({ code, stdout, stderr }));
    });

    assert.equal(res.code, 2);
    const outLines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(outLines.length, 3);
    assert.equal(outLines[1].code, 'INVALID_ROW');
  });

  it('8. Object with unknown keys or __proto__ is rejected as INVALID_ROW', async () => {
    const input = [
      JSON.stringify({ value: 1, from: 'm', to: 'km', hacker: 'payload' }),
      '{"value":1,"from":"m","to":"km","__proto__":{"polluted":true}}',
    ].join('\n') + '\n';

    const res = await runCli(['batch', '--format', 'ndjson'], input);
    assert.equal(res.code, 2);
    const outLines = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(outLines[0].code, 'INVALID_ROW');
    assert.equal(outLines[1].code, 'INVALID_ROW');
  });

  it('9. Extreme values never produce unquoted NaN or Infinity in output JSON', async () => {
    const input = JSON.stringify({ value: 1e308, from: 'mi', to: 'mm' }) + '\n';
    const res = await runCli(['batch', '--format', 'ndjson'], input);
    assert.equal(res.code, 2);
    const parsed = JSON.parse(res.stdout.trim());
    assert.equal(parsed.ok, false);
    assert.equal(parsed.code, 'NUMERIC_OVERFLOW');
  });
});
