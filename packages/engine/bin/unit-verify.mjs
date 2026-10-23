#!/usr/bin/env node
import process from 'node:process';
import { once } from 'node:events';
import {
  convert,
  describeUnit,
  listUnits,
  CATALOG_VERSION,
  DIMENSIONS,
} from '../dist/index.js';

const VERSION = '0.1.0';
const DEFAULT_BATCH_MAX_RECORDS = 10_000;
const HARD_MAX_BATCH_RECORDS = 100_000;
const MAX_LINE_BYTES = 16_384; // 16 KiB
const ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

// Graceful EPIPE handling
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') {
    process.exit(0);
  }
});

function printUsage() {
  const usage = `RaxoCode Unit Verify v${VERSION}
Offline unit conversion with explicit ambiguity and dimensional checks.

Usage:
  unit-verify convert --value <number> --from <unit> --to <unit> [--format human|json]
  unit-verify batch --format ndjson [--max-records <number>] < input.ndjson > output.ndjson
  unit-verify list [--format human|json] [--dimension <dimension>]
  unit-verify describe --unit <unit> [--format human|json]
  unit-verify --help
  unit-verify --version

Exit Codes:
  0: Success
  2: User conversion error / batch record failure
  3: CLI usage or resource limit error
  1: Internal program failure
`;
  process.stdout.write(usage);
}

function parseCliArgs(args) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.version = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command: positional[0], flags, extraArgs: positional.slice(1) };
}

async function handleConvert(flags) {
  const allowedFlags = ['value', 'from', 'to', 'format'];
  for (const k of Object.keys(flags)) {
    if (!allowedFlags.includes(k)) {
      process.stderr.write(`Error: Unknown flag '--${k}' for convert command\n`);
      process.exit(3);
    }
  }

  const { value: rawVal, from, to, format = 'human' } = flags;

  if (rawVal === undefined || from === undefined || to === undefined) {
    process.stderr.write('Error: convert command requires --value, --from, and --to flags\n');
    process.exit(3);
  }

  if (format !== 'human' && format !== 'json') {
    process.stderr.write("Error: --format must be either 'human' or 'json'\n");
    process.exit(3);
  }

  const numVal = Number(rawVal);
  if (typeof rawVal !== 'string' || rawVal.trim() === '' || !Number.isFinite(numVal)) {
    if (format === 'json') {
      const errRes = {
        ok: false,
        schemaVersion: '1',
        catalogVersion: CATALOG_VERSION,
        code: 'INVALID_INPUT',
        message: `Value must be a finite number; received '${rawVal}'`,
      };
      process.stdout.write(JSON.stringify(errRes) + '\n');
      process.exit(2);
    } else {
      process.stderr.write(`Error [INVALID_INPUT]: Value must be a finite number; received '${rawVal}'\n`);
      process.exit(2);
    }
  }

  const res = convert({ value: numVal, from: String(from), to: String(to) });

  if (format === 'json') {
    process.stdout.write(JSON.stringify(res) + '\n');
    process.exit(res.ok ? 0 : 2);
  }

  if (res.ok) {
    const calcInfo = `[${res.calculation.kind}: scale=${res.calculation.scale}, offset=${res.calculation.offset}]`;
    process.stdout.write(`${res.input.value} ${res.input.from} = ${res.result} ${res.unit} (${res.dimension}) ${calcInfo}\n`);
    process.exit(0);
  } else {
    process.stderr.write(`Error [${res.code}]: ${res.message}\n`);
    if (res.choices && res.choices.length > 0) {
      process.stderr.write(`Choices: ${res.choices.join(', ')}\n`);
    }
    process.exit(2);
  }
}

async function handleList(flags) {
  const allowedFlags = ['format', 'dimension'];
  for (const k of Object.keys(flags)) {
    if (!allowedFlags.includes(k)) {
      process.stderr.write(`Error: Unknown flag '--${k}' for list command\n`);
      process.exit(3);
    }
  }

  const { format = 'human', dimension } = flags;
  if (format !== 'human' && format !== 'json') {
    process.stderr.write("Error: --format must be either 'human' or 'json'\n");
    process.exit(3);
  }

  if (dimension && !DIMENSIONS.includes(dimension)) {
    process.stderr.write(`Error: Unknown dimension '${dimension}'. Supported: ${DIMENSIONS.join(', ')}\n`);
    process.exit(3);
  }

  const units = listUnits(dimension ? { dimension } : undefined);

  if (format === 'json') {
    process.stdout.write(JSON.stringify({ catalogVersion: CATALOG_VERSION, units }, null, 2) + '\n');
    process.exit(0);
  }

  process.stdout.write(`RaxoCode Unit Catalog v${CATALOG_VERSION} (${units.length} units)\n\n`);
  for (const u of units) {
    const scaleStr = u.toBaseScale !== undefined ? ` (scale to base: ${u.toBaseScale})` : ' (affine temperature)';
    process.stdout.write(`- ${u.id.padEnd(8)} [${u.dimension}] ${u.name} (symbol: ${u.symbol})${scaleStr}\n`);
  }
  process.exit(0);
}

async function handleDescribe(flags) {
  const allowedFlags = ['unit', 'format'];
  for (const k of Object.keys(flags)) {
    if (!allowedFlags.includes(k)) {
      process.stderr.write(`Error: Unknown flag '--${k}' for describe command\n`);
      process.exit(3);
    }
  }

  const { unit, format = 'human' } = flags;
  if (!unit || typeof unit !== 'string') {
    process.stderr.write('Error: describe command requires --unit <name>\n');
    process.exit(3);
  }

  if (format !== 'human' && format !== 'json') {
    process.stderr.write("Error: --format must be either 'human' or 'json'\n");
    process.exit(3);
  }

  const res = describeUnit(unit);

  if (format === 'json') {
    process.stdout.write(JSON.stringify(res, null, 2) + '\n');
    process.exit(res.ok ? 0 : 2);
  }

  if (res.ok) {
    const u = res.unit;
    process.stdout.write(`Unit: ${u.name} (${u.id})\n`);
    process.stdout.write(`  Dimension: ${u.dimension}\n`);
    process.stdout.write(`  Symbol:    ${u.symbol}\n`);
    if (u.toBaseScale !== undefined) {
      process.stdout.write(`  Base scale: ${u.toBaseScale}\n`);
    }
    process.stdout.write(`  Aliases:   ${u.aliases.join(', ')}\n`);
    process.stdout.write(`  Sources:   ${u.sourceIds.join(', ')}\n`);
    process.exit(0);
  } else {
    process.stderr.write(`Error [${res.code}]: ${res.message}\n`);
    if (res.choices) {
      process.stderr.write(`Choices: ${res.choices.join(', ')}\n`);
    }
    process.exit(2);
  }
}

async function handleBatch(flags) {
  const allowedFlags = ['format', 'max-records'];
  for (const k of Object.keys(flags)) {
    if (!allowedFlags.includes(k)) {
      process.stderr.write(`Error: Unknown flag '--${k}' for batch command\n`);
      process.exit(3);
    }
  }

  if (flags.format !== 'ndjson') {
    process.stderr.write("Error: batch command requires '--format ndjson'\n");
    process.exit(3);
  }

  let maxRecords = DEFAULT_BATCH_MAX_RECORDS;
  if (flags['max-records'] !== undefined) {
    const parsed = Number(flags['max-records']);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > HARD_MAX_BATCH_RECORDS) {
      process.stderr.write(
        `Error: --max-records must be an integer between 1 and ${HARD_MAX_BATCH_RECORDS}\n`,
      );
      process.exit(3);
    }
    maxRecords = parsed;
  }

  const startTime = Date.now();
  let physicalLineCount = 0;
  let totalProcessed = 0;
  let totalFailures = 0;
  let oversizedCount = 0;
  let invalidCount = 0;

  // Byte-bounded streaming line splitter
  let lineBuffer = Buffer.alloc(MAX_LINE_BYTES);
  let lineBytesLen = 0;
  let isDiscarding = false;

  async function emitRecord(record) {
    totalProcessed++;
    if (!record.ok) {
      totalFailures++;
    }
    const lineStr = JSON.stringify(record) + '\n';
    const canContinue = process.stdout.write(lineStr);
    if (!canContinue) {
      await once(process.stdout, 'drain');
    }
    if (totalProcessed % 256 === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  async function processCompletedLine(lineBuf) {
    physicalLineCount++;

    if (physicalLineCount > maxRecords) {
      process.stderr.write(
        `Error [BATCH_LIMIT]: Batch physical record count exceeded maximum allowed limit of ${maxRecords}\n`,
      );
      process.exit(3);
    }

    if (isDiscarding) {
      isDiscarding = false;
      oversizedCount++;
      await emitRecord({
        line: physicalLineCount,
        ok: false,
        code: 'ROW_TOO_LARGE',
        message: `Line exceeded maximum byte limit of ${MAX_LINE_BYTES} bytes`,
      });
      return;
    }

    // Strip carriage return if present
    let finalBuf = lineBuf;
    if (finalBuf.length > 0 && finalBuf[finalBuf.length - 1] === 0x0d) {
      finalBuf = finalBuf.subarray(0, finalBuf.length - 1);
    }

    // UTF-8 conversion and validation
    let text;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      text = decoder.decode(finalBuf);
    } catch {
      invalidCount++;
      await emitRecord({
        line: physicalLineCount,
        ok: false,
        code: 'INVALID_ROW',
        message: 'Invalid UTF-8 sequence in line',
      });
      return;
    }

    const trimmed = text.trim();
    if (trimmed === '') {
      invalidCount++;
      await emitRecord({
        line: physicalLineCount,
        ok: false,
        code: 'INVALID_ROW',
        message: 'Empty or blank line in batch stream',
      });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      invalidCount++;
      await emitRecord({
        line: physicalLineCount,
        ok: false,
        code: 'INVALID_JSON',
        message: 'Line is not valid JSON',
      });
      return;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      invalidCount++;
      await emitRecord({
        line: physicalLineCount,
        ok: false,
        code: 'INVALID_ROW',
        message: 'Batch row must be a shallow JSON object',
      });
      return;
    }

    // Check allowed keys only
    const allowedKeys = ['id', 'value', 'from', 'to'];
    const keys = Object.keys(parsed);
    for (const k of keys) {
      if (!allowedKeys.includes(k) || k === '__proto__' || k === 'constructor') {
        invalidCount++;
        await emitRecord({
          line: physicalLineCount,
          ok: false,
          code: 'INVALID_ROW',
          message: `Unknown or forbidden property '${k}' in input object`,
        });
        return;
      }
    }

    // Validate optional id
    let validId;
    if ('id' in parsed) {
      if (typeof parsed.id !== 'string' || !ID_REGEX.test(parsed.id)) {
        invalidCount++;
        await emitRecord({
          line: physicalLineCount,
          ok: false,
          code: 'INVALID_ROW',
          message: 'Invalid id: must be a string of 1-64 ASCII letters, digits, underscores or hyphens',
        });
        return;
      }
      validId = parsed.id;
    }

    // Validate required fields
    if (
      typeof parsed.value !== 'number' ||
      !Number.isFinite(parsed.value) ||
      typeof parsed.from !== 'string' ||
      typeof parsed.to !== 'string'
    ) {
      invalidCount++;
      await emitRecord({
        line: physicalLineCount,
        ...(validId ? { id: validId } : {}),
        ok: false,
        code: 'INVALID_ROW',
        message: 'Row requires finite number value, and string from and to properties',
      });
      return;
    }

    const convRes = convert({ value: parsed.value, from: parsed.from, to: parsed.to });
    const outputRecord = {
      line: physicalLineCount,
      ...(validId ? { id: validId } : {}),
      ...convRes,
    };

    await emitRecord(outputRecord);
  }

  for await (const chunk of process.stdin) {
    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

    for (let i = 0; i < chunkBuf.length; i++) {
      const b = chunkBuf[i];

      if (b === 0x0a) {
        // Newline encountered
        const completed = lineBuffer.subarray(0, lineBytesLen);
        lineBytesLen = 0;
        await processCompletedLine(completed);
      } else {
        if (isDiscarding) {
          continue;
        }

        if (lineBytesLen < MAX_LINE_BYTES) {
          lineBuffer[lineBytesLen++] = b;
        } else {
          // Line exceeded 16,384 bytes: enter discard mode
          isDiscarding = true;
          lineBytesLen = 0;
        }
      }
    }
  }

  // Handle final line without trailing newline
  if (lineBytesLen > 0 || isDiscarding) {
    const completed = lineBuffer.subarray(0, lineBytesLen);
    lineBytesLen = 0;
    await processCompletedLine(completed);
  }

  const elapsedMs = Date.now() - startTime;
  process.stderr.write(
    `[unit-verify batch] Processed ${totalProcessed} records (${totalFailures} failures, ${oversizedCount} oversized, ${invalidCount} invalid) in ${elapsedMs}ms\n`,
  );

  process.exit(totalFailures > 0 ? 2 : 0);
}

async function main() {
  const args = process.argv.slice(2);
  const { command, flags } = parseCliArgs(args);

  if (flags.help || (!command && Object.keys(flags).length === 0)) {
    printUsage();
    process.exit(0);
  }

  if (flags.version) {
    process.stdout.write(`unit-verify ${VERSION}\n`);
    process.exit(0);
  }

  switch (command) {
    case 'convert':
      await handleConvert(flags);
      break;
    case 'batch':
      await handleBatch(flags);
      break;
    case 'list':
      await handleList(flags);
      break;
    case 'describe':
      await handleDescribe(flags);
      break;
    default:
      process.stderr.write(`Error: Unknown command '${command}'. Run 'unit-verify --help' for usage.\n`);
      process.exit(3);
  }
}

main().catch((err) => {
  process.stderr.write(`Internal Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
