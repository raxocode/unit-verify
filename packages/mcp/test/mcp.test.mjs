import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MCP_BIN = path.resolve(__dirname, '../dist/index.js');

async function createConnectedClient() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_BIN],
  });
  const client = new Client({ name: 'test-client', version: '0.1.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

describe('Local MCP Adapter Suite', () => {
  it('1. Connects, initializes and lists exactly four declared tools', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      const toolList = await client.listTools();
      assert.ok(Array.isArray(toolList.tools));
      assert.equal(toolList.tools.length, 4);

      const toolNames = toolList.tools.map((t) => t.name).sort();
      assert.deepEqual(toolNames, [
        'convert_unit',
        'convert_units_batch',
        'describe_unit',
        'list_units',
      ]);
    } finally {
      await transport.close();
    }
  });

  it('2. convert_unit produces identical result to core engine', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      const res = await client.callTool({
        name: 'convert_unit',
        arguments: { value: 125, from: 'ft', to: 'm' },
      });

      assert.equal(res.isError, undefined);
      assert.ok(res.content && res.content.length > 0);
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.result, 38.1);
      assert.equal(parsed.unit, 'm');
      assert.equal(parsed.dimension, 'length');
    } finally {
      await transport.close();
    }
  });

  it('3. convert_unit returns structured error on ambiguity and dimension mismatch', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      // Ambiguity
      const ambRes = await client.callTool({
        name: 'convert_unit',
        arguments: { value: 12, from: 'ton', to: 'kg' },
      });
      const ambParsed = JSON.parse(ambRes.content[0].text);
      assert.equal(ambParsed.ok, false);
      assert.equal(ambParsed.code, 'AMBIGUOUS_UNIT');
      assert.deepEqual(ambParsed.choices, ['tonne', 'ton_us', 'ton_uk']);

      // Dimension mismatch
      const dimRes = await client.callTool({
        name: 'convert_unit',
        arguments: { value: 50, from: 'kN', to: 'kg' },
      });
      const dimParsed = JSON.parse(dimRes.content[0].text);
      assert.equal(dimParsed.ok, false);
      assert.equal(dimParsed.code, 'DIMENSION_MISMATCH');
    } finally {
      await transport.close();
    }
  });

  it('4. convert_units_batch handles 100 items, and rejects 101 items before execution', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      // 100 items: works
      const items100 = new Array(100).fill({ value: 1, from: 'm', to: 'cm' });
      const res100 = await client.callTool({
        name: 'convert_units_batch',
        arguments: { items: items100 },
      });
      const parsed100 = JSON.parse(res100.content[0].text);
      assert.equal(parsed100.ok, true);
      assert.equal(parsed100.total, 100);
      assert.equal(parsed100.failures, 0);

      // 101 items: rejected
      const items101 = new Array(101).fill({ value: 1, from: 'm', to: 'cm' });
      const res101 = await client.callTool({
        name: 'convert_units_batch',
        arguments: { items: items101 },
      });
      const parsed101 = JSON.parse(res101.content[0].text);
      assert.equal(parsed101.ok, false);
      assert.equal(parsed101.code, 'BATCH_LIMIT');
      assert.ok(parsed101.message.includes('100'));
    } finally {
      await transport.close();
    }
  });

  it('5. Invalid entry in batch does not crash or erase other results', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      const items = [
        { value: 10, from: 'm', to: 'km' },
        { value: 1, from: 'ton', to: 'kg' },
        { value: 20, from: 'm', to: 'km' },
      ];
      const res = await client.callTool({
        name: 'convert_units_batch',
        arguments: { items },
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.total, 3);
      assert.equal(parsed.failures, 1);
      assert.equal(parsed.results[0].ok, true);
      assert.equal(parsed.results[1].ok, false);
      assert.equal(parsed.results[2].ok, true);
    } finally {
      await transport.close();
    }
  });

  it('6. describe_unit returns detailed metadata or structured error', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      const res = await client.callTool({
        name: 'describe_unit',
        arguments: { unit: 'psi' },
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.unit.id, 'psi');
      assert.equal(parsed.unit.dimension, 'pressure');
      assert.ok(parsed.unit.aliases.includes('pounds per square inch'));
    } finally {
      await transport.close();
    }
  });

  it('7. list_units returns all 51 canonical units and handles optional dimension filter', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      const resAll = await client.callTool({
        name: 'list_units',
        arguments: {},
      });
      const parsedAll = JSON.parse(resAll.content[0].text);
      assert.equal(parsedAll.ok, true);
      assert.equal(parsedAll.count, 51);

      const resForce = await client.callTool({
        name: 'list_units',
        arguments: { dimension: 'force' },
      });
      const parsedForce = JSON.parse(resForce.content[0].text);
      assert.equal(parsedForce.ok, true);
      assert.equal(parsedForce.count, 3);
    } finally {
      await transport.close();
    }
  });

  it('8. Enforces 64 KiB tool response limit', async () => {
    const { client, transport } = await createConnectedClient();
    try {
      // 100 invalid items with repeated queries
      const items = new Array(100).fill({ value: 1, from: 'ton', to: 'kg' });
      const res = await client.callTool({
        name: 'convert_units_batch',
        arguments: { items },
      });
      assert.ok(res.content && res.content.length > 0);
      const text = res.content[0].text;
      const bytes = Buffer.byteLength(text, 'utf8');
      assert.ok(bytes <= 64 * 1024, `Response byte size ${bytes} exceeded 64 KiB`);
    } finally {
      await transport.close();
    }
  });

  it('9. Verifies stdout has pure JSON-RPC without banner or debug pollution', async () => {
    const proc = spawn(process.execPath, [MCP_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    }) + '\n';

    proc.stdin.write(initMsg);

    const firstChunk = await new Promise((resolve) => {
      proc.stdout.once('data', (d) => resolve(d.toString('utf8')));
    });

    proc.kill('SIGTERM');

    const lines = firstChunk.trim().split('\n').filter(Boolean);
    for (const l of lines) {
      assert.doesNotThrow(() => JSON.parse(l), `Line is not valid JSON-RPC: ${l}`);
      const parsed = JSON.parse(l);
      assert.equal(parsed.jsonrpc, '2.0');
    }
  });
});
