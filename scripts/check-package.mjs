#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ENGINE_PKG = path.resolve(ROOT, 'packages/engine');
const MCP_PKG = path.resolve(ROOT, 'packages/mcp');

console.log('Running package smoke tests...');

// 1. Verify build artifacts exist
const engineDist = path.resolve(ENGINE_PKG, 'dist/index.js');
const engineTypes = path.resolve(ENGINE_PKG, 'dist/index.d.ts');
const mcpDist = path.resolve(MCP_PKG, 'dist/index.js');

if (!existsSync(engineDist) || !existsSync(engineTypes)) {
  console.error('FAIL: Engine dist files missing. Run build first.');
  process.exit(1);
}

if (!existsSync(mcpDist)) {
  console.error('FAIL: MCP dist files missing. Run build first.');
  process.exit(1);
}
console.log('✓ Build artifacts exist');

// 2. Test ESM import of engine
const importTest = spawnSync(process.execPath, [
  '--input-type=module',
  '-e',
  `import { convert, listUnits, CATALOG_VERSION } from '${engineDist}';
   if (typeof convert !== 'function') throw new Error('convert is not a function');
   if (listUnits().length !== 51) throw new Error('listUnits count mismatch');
   console.log('Engine import OK, catalog version:', CATALOG_VERSION);`,
], { encoding: 'utf8' });

if (importTest.status !== 0) {
  console.error('FAIL: Engine ESM import test failed:\n', importTest.stderr);
  process.exit(1);
}
console.log('✓ Pure ESM import of engine works');

// 3. Verify engine dist does not reference Node builtins
const engineCode = readFileSync(engineDist, 'utf8');
const forbiddenNodeModules = ['fs', 'child_process', 'net', 'http', 'https', 'crypto', 'cluster', 'dns'];
for (const mod of forbiddenNodeModules) {
  if (engineCode.includes(`from '${mod}'`) || engineCode.includes(`from "node:${mod}"`)) {
    console.error(`FAIL: Engine bundle contains reference to Node builtin '${mod}'`);
    process.exit(1);
  }
}
console.log('✓ Engine core has zero Node built-in imports (browser-safe)');

// 4. Test CLI binary
const cliBin = path.resolve(ENGINE_PKG, 'bin/unit-verify.mjs');
const cliTest = spawnSync(process.execPath, [cliBin, '--version'], { encoding: 'utf8' });
if (cliTest.status !== 0 || !cliTest.stdout.includes('0.1.0')) {
  console.error('FAIL: CLI binary check failed:\n', cliTest.stderr);
  process.exit(1);
}
console.log('✓ CLI binary execution works');

// 5. Test MCP binary responds
const mcpBin = path.resolve(MCP_PKG, 'dist/index.js');
const mcpTest = spawnSync(process.execPath, [mcpBin], {
  input: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '1.0' } } }) + '\n',
  encoding: 'utf8',
  timeout: 5000,
});
if (!mcpTest.stdout.includes('2.0')) {
  console.error('FAIL: MCP binary check failed:\n', mcpTest.stderr);
  process.exit(1);
}
console.log('✓ MCP binary stdio initialization works');

// 6. Verify package.json manifests
const engineManifest = JSON.parse(readFileSync(path.resolve(ENGINE_PKG, 'package.json'), 'utf8'));
if (Object.keys(engineManifest.dependencies || {}).length > 0) {
  console.error('FAIL: Engine package must have zero runtime dependencies!');
  process.exit(1);
}
console.log('✓ Engine package has zero runtime dependencies');

console.log('\nAll smoke checks PASSED successfully!');
process.exit(0);
