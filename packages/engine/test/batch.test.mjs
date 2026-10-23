import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertBatch } from '../dist/index.js';

describe('In-Memory convertBatch', () => {
  it('processes mixed valid and invalid batch items in order', () => {
    const requests = [
      { value: 100, from: 'm', to: 'km' },
      { value: 12, from: 'ton', to: 'kg' },
      { value: 50, from: 'kN', to: 'kg' },
      { value: 1, from: 'in', to: 'mm' },
    ];

    const res = convertBatch(requests);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.total, 4);
      assert.equal(res.failures, 2);
      assert.equal(res.results.length, 4);

      assert.equal(res.results[0].ok, true);
      if (res.results[0].ok) assert.equal(res.results[0].result, 0.1);

      assert.equal(res.results[1].ok, false);
      if (!res.results[1].ok) assert.equal(res.results[1].code, 'AMBIGUOUS_UNIT');

      assert.equal(res.results[2].ok, false);
      if (!res.results[2].ok) assert.equal(res.results[2].code, 'DIMENSION_MISMATCH');

      assert.equal(res.results[3].ok, true);
      if (res.results[3].ok) assert.equal(res.results[3].result, 25.4);
    }
  });

  it('enforces hard ceiling of 10,000 items and rejects 10,001 without executing', () => {
    // 10,000 items works
    const valid10k = new Array(10_000).fill({ value: 1, from: 'm', to: 'cm' });
    const res10k = convertBatch(valid10k);
    assert.equal(res10k.ok, true);
    if (res10k.ok) {
      assert.equal(res10k.total, 10_000);
      assert.equal(res10k.failures, 0);
    }

    // 10,001 items fails immediately with BATCH_LIMIT
    const invalid10001 = new Array(10_001).fill({ value: 1, from: 'm', to: 'cm' });
    const res10001 = convertBatch(invalid10001);
    assert.equal(res10001.ok, false);
    if (!res10001.ok) {
      assert.equal(res10001.code, 'BATCH_LIMIT');
      assert.ok(res10001.message.includes('10001'));
    }
  });

  it('respects options.maxItems within the 10,000 ceiling', () => {
    const items = new Array(50).fill({ value: 1, from: 'm', to: 'cm' });
    const resLimited = convertBatch(items, { maxItems: 25 });
    assert.equal(resLimited.ok, false);
    if (!resLimited.ok) {
      assert.equal(resLimited.code, 'BATCH_LIMIT');
    }

    // Cannot increase beyond 10,000
    const resOversizeOption = convertBatch(new Array(10_001).fill({ value: 1, from: 'm', to: 'cm' }), {
      maxItems: 50_000,
    });
    assert.equal(resOversizeOption.ok, false);
    if (!resOversizeOption.ok) {
      assert.equal(resOversizeOption.code, 'BATCH_LIMIT');
    }
  });

  it('rejects non-array input with INVALID_INPUT', () => {
    const res = convertBatch('not-an-array');
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, 'INVALID_INPUT');
    }
  });
});
