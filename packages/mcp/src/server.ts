import { Buffer } from 'node:buffer';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  convert,
  convertBatch,
  describeUnit,
  listUnits,
  CATALOG_VERSION,
  type Dimension,
  DIMENSIONS,
} from '@raxocode/unit-verify';

export const SERVER_NAME = 'raxocode-unit-verify';
export const SERVER_VERSION = '0.1.0';
export const MAX_MCP_BATCH_ITEMS = 100;
export const MAX_RESPONSE_BYTES = 64 * 1024; // 64 KiB

const TOOLS: Tool[] = [
  {
    name: 'convert_unit',
    description: 'Convert an explicitly identified unit to another compatible unit offline with strict dimensional verification.',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'Finite numerical value to convert' },
        from: { type: 'string', description: 'Source unit identifier or symbol (max 32 code points)' },
        to: { type: 'string', description: 'Target unit identifier or symbol (max 32 code points)' },
      },
      required: ['value', 'from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'convert_units_batch',
    description: 'Batch convert multiple unit requests offline in-process (hard limit: 100 items).',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of 1 to 100 conversion requests',
          items: {
            type: 'object',
            properties: {
              value: { type: 'number' },
              from: { type: 'string' },
              to: { type: 'string' },
            },
            required: ['value', 'from', 'to'],
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 100,
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  {
    name: 'describe_unit',
    description: 'Describe a unit including canonical ID, dimension, symbol, base relationship, citations, and aliases.',
    inputSchema: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: 'Unit identifier or alias (max 32 code points)' },
      },
      required: ['unit'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_units',
    description: 'List supported canonical units across dimensions from the offline catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        dimension: {
          type: 'string',
          description: 'Optional physical dimension filter',
          enum: [...DIMENSIONS],
        },
      },
      additionalProperties: false,
    },
  },
];

function formatToolResponse(payload: unknown) {
  const json = JSON.stringify(payload);
  const byteLength = Buffer.byteLength(json, 'utf8');

  if (byteLength > MAX_RESPONSE_BYTES) {
    const errorPayload = {
      ok: false,
      code: 'RESPONSE_TOO_LARGE',
      message: `Tool response size (${byteLength} bytes) exceeds the 64 KiB safety limit`,
    };
    return {
      isError: true,
      content: [{ type: 'text' as const, text: JSON.stringify(errorPayload) }],
    };
  }

  return {
    content: [{ type: 'text' as const, text: json }],
  };
}

export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'convert_unit') {
        if (!args || typeof args !== 'object') {
          return formatToolResponse({ ok: false, code: 'INVALID_INPUT', message: 'Missing tool arguments' });
        }
        const { value, from, to } = args as Record<string, unknown>;
        if (typeof value !== 'number' || !Number.isFinite(value) || typeof from !== 'string' || typeof to !== 'string') {
          return formatToolResponse({
            ok: false,
            code: 'INVALID_INPUT',
            message: 'Invalid arguments: value must be a finite number; from and to must be strings',
          });
        }
        const res = convert({ value, from, to });
        return formatToolResponse(res);
      }

      if (name === 'convert_units_batch') {
        if (!args || typeof args !== 'object') {
          return formatToolResponse({ ok: false, code: 'INVALID_INPUT', message: 'Missing tool arguments' });
        }
        const items = (args as Record<string, unknown>).items;
        if (!Array.isArray(items)) {
          return formatToolResponse({ ok: false, code: 'INVALID_INPUT', message: 'Items must be an array' });
        }
        if (items.length === 0) {
          return formatToolResponse({ ok: false, code: 'INVALID_INPUT', message: 'Items array must not be empty' });
        }
        if (items.length > MAX_MCP_BATCH_ITEMS) {
          return formatToolResponse({
            ok: false,
            code: 'BATCH_LIMIT',
            message: `Batch item count (${items.length}) exceeds MCP hard limit of ${MAX_MCP_BATCH_ITEMS}`,
          });
        }

        // Validate each item shallowly
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item || typeof item !== 'object') {
            return formatToolResponse({
              ok: false,
              code: 'INVALID_INPUT',
              message: `Item at index ${i} is not a valid object`,
            });
          }
        }

        const batchRes = convertBatch(items, { maxItems: MAX_MCP_BATCH_ITEMS });
        return formatToolResponse(batchRes);
      }

      if (name === 'describe_unit') {
        if (!args || typeof args !== 'object') {
          return formatToolResponse({ ok: false, code: 'INVALID_INPUT', message: 'Missing tool arguments' });
        }
        const unit = (args as Record<string, unknown>).unit;
        if (typeof unit !== 'string') {
          return formatToolResponse({
            ok: false,
            code: 'INVALID_INPUT',
            message: 'Unit parameter must be a string',
          });
        }
        const desc = describeUnit(unit);
        return formatToolResponse(desc);
      }

      if (name === 'list_units') {
        let dimension: Dimension | undefined = undefined;
        if (args && typeof args === 'object' && 'dimension' in args) {
          const dim = (args as Record<string, unknown>).dimension;
          if (typeof dim === 'string') {
            if (!DIMENSIONS.includes(dim as Dimension)) {
              return formatToolResponse({
                ok: false,
                code: 'INVALID_INPUT',
                message: `Unknown dimension '${dim}'. Supported dimensions: ${DIMENSIONS.join(', ')}`,
              });
            }
            dimension = dim as Dimension;
          }
        }
        const units = listUnits(dimension ? { dimension } : undefined);
        return formatToolResponse({
          ok: true,
          catalogVersion: CATALOG_VERSION,
          count: units.length,
          units,
        });
      }

      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Internal tool execution error: ${msg}` }],
      };
    }
  });

  return server;
}
