import type { BatchResponse, ConversionRequest, ConversionResponse } from './types.js';
import { convert } from './convert.js';

export const MAX_IN_MEMORY_BATCH = 10_000;

export function convertBatch(
  requests: readonly ConversionRequest[],
  options?: { maxItems?: number },
): BatchResponse {
  if (!Array.isArray(requests)) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: 'Batch requests must be provided as an array',
    };
  }

  // Hard limit is 10,000; options may reduce it but never exceed 10,000
  let limit = MAX_IN_MEMORY_BATCH;
  if (options && typeof options.maxItems === 'number' && Number.isFinite(options.maxItems)) {
    limit = Math.min(Math.max(1, Math.floor(options.maxItems)), MAX_IN_MEMORY_BATCH);
  }

  if (requests.length > limit) {
    return {
      ok: false,
      code: 'BATCH_LIMIT',
      message: `Batch requests count (${requests.length}) exceeds maximum allowed limit of ${limit}`,
    };
  }

  const results: ConversionResponse[] = new Array(requests.length);
  let failures = 0;

  for (let i = 0; i < requests.length; i++) {
    const res = convert(requests[i]);
    results[i] = res;
    if (!res.ok) {
      failures++;
    }
  }

  return {
    ok: true,
    results,
    total: requests.length,
    failures,
  };
}
