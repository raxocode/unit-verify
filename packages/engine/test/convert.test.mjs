import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convert, CATALOG_VERSION } from '../dist/index.js';

function assertClose(actual, expected, msg, tolerance = 1e-10) {
  const diff = Math.abs(actual - expected);
  if (Math.abs(expected) > 1) {
    const rel = diff / Math.abs(expected);
    assert.ok(
      rel <= tolerance || diff <= tolerance,
      `${msg}: actual ${actual} not close to expected ${expected} (rel diff: ${rel}, abs diff: ${diff})`,
    );
  } else {
    assert.ok(diff <= tolerance, `${msg}: actual ${actual} not close to expected ${expected} (abs diff: ${diff})`);
  }
}

describe('Core Conversion Engine Contract', () => {
  describe('Golden Conversion Cases', () => {
    const goldenCases = [
      { value: 125, from: 'ft', to: 'm', expected: 38.1 },
      { value: 1, from: 'in', to: 'mm', expected: 25.4 },
      { value: 1, from: 'mi', to: 'km', expected: 1.609344 },
      { value: 1, from: 'gal_us', to: 'L', expected: 3.785411784 },
      { value: 1, from: 'gal_uk', to: 'L', expected: 4.54609 },
      { value: 1, from: 'acre', to: 'm2', expected: 4046.8564224 },
      { value: 1, from: 'lbf', to: 'N', expected: 4.4482216152605 },
      { value: 1, from: 'bar', to: 'kPa', expected: 100 },
      { value: 1, from: 'm/s', to: 'km/h', expected: 3.6 },
      { value: 1, from: 'KiB', to: 'B', expected: 1024 },
      { value: 1, from: 'kB', to: 'B', expected: 1000 },
      { value: 32, from: 'degF', to: 'degC', expected: 0 },
      { value: 100, from: 'degC', to: 'degF', expected: 212 },
      { value: -40, from: 'degC', to: 'degF', expected: -40 },
      { value: -273.15, from: 'degC', to: 'K', expected: 0 },
      { value: 273.15, from: 'K', to: 'degC', expected: 0 },
    ];

    for (const { value, from, to, expected } of goldenCases) {
      it(`converts ${value} ${from} -> ${to} ≈ ${expected}`, () => {
        const res = convert({ value, from, to });
        assert.equal(res.ok, true, `Conversion failed: ${res.ok ? '' : res.message}`);
        if (res.ok) {
          assert.equal(res.schemaVersion, '1');
          assert.equal(res.catalogVersion, CATALOG_VERSION);
          assert.equal(res.unit, to);
          assertClose(res.result, expected, `${value} ${from} -> ${to}`);
        }
      });
    }
  });

  describe('Reverse Conversions & Round-Trips', () => {
    it('round trips ft -> m -> ft accurately', () => {
      const res1 = convert({ value: 100, from: 'ft', to: 'm' });
      assert.equal(res1.ok, true);
      if (res1.ok) {
        const res2 = convert({ value: res1.result, from: 'm', to: 'ft' });
        assert.equal(res2.ok, true);
        if (res2.ok) {
          assertClose(res2.result, 100, 'Round trip ft -> m -> ft');
        }
      }
    });

    it('round trips degC -> degF -> degC accurately', () => {
      const res1 = convert({ value: 37, from: 'degC', to: 'degF' });
      assert.equal(res1.ok, true);
      if (res1.ok) {
        const res2 = convert({ value: res1.result, from: 'degF', to: 'degC' });
        assert.equal(res2.ok, true);
        if (res2.ok) {
          assertClose(res2.result, 37, 'Round trip degC -> degF -> degC');
        }
      }
    });

    it('same unit conversion returns exact identity', () => {
      const resLinear = convert({ value: 42.195, from: 'km', to: 'km' });
      assert.equal(resLinear.ok, true);
      if (resLinear.ok) {
        assert.equal(resLinear.result, 42.195);
      }

      const resTemp = convert({ value: 298.15, from: 'K', to: 'K' });
      assert.equal(resTemp.ok, true);
      if (resTemp.ok) {
        assert.equal(resTemp.result, 298.15);
      }
    });
  });

  describe('Signed Differences & Negative Values', () => {
    it('allows negative linear quantities', () => {
      const res = convert({ value: -10, from: 'm', to: 'cm' });
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.result, -1000);
      }
    });

    it('allows zero in linear and temperature', () => {
      const resZeroM = convert({ value: 0, from: 'm', to: 'ft' });
      assert.equal(resZeroM.ok, true);
      if (resZeroM.ok) assert.equal(resZeroM.result, 0);

      const resZeroC = convert({ value: 0, from: 'degC', to: 'K' });
      assert.equal(resZeroC.ok, true);
      if (resZeroC.ok) assertClose(resZeroC.result, 273.15, '0 degC -> K');
    });
  });

  describe('Ambiguity Handling', () => {
    it('rejects ambiguous ton with deterministic choices', () => {
      const res = convert({ value: 12, from: 'ton', to: 'kg' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'AMBIGUOUS_UNIT');
        assert.deepEqual(res.choices, ['tonne', 'ton_us', 'ton_uk']);
      }
    });

    it('rejects ambiguous gallon with deterministic choices', () => {
      const res = convert({ value: 1, from: 'gallon', to: 'L' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'AMBIGUOUS_UNIT');
        assert.deepEqual(res.choices, ['gal_us', 'gal_uk']);
      }
    });

    it('rejects ambiguous fl oz with deterministic choices', () => {
      const res = convert({ value: 16, from: 'fl oz', to: 'L' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'AMBIGUOUS_UNIT');
        assert.deepEqual(res.choices, ['gal_us', 'gal_uk']);
      }
    });
  });

  describe('Dimension Mismatches', () => {
    it('rejects kN -> kg (force vs mass)', () => {
      const res = convert({ value: 50, from: 'kN', to: 'kg' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'DIMENSION_MISMATCH');
        assert.ok(res.message.includes('force'));
        assert.ok(res.message.includes('mass'));
      }
    });

    it('rejects m2 -> m3 (area vs volume)', () => {
      const res = convert({ value: 7, from: 'm2', to: 'm3' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'DIMENSION_MISMATCH');
        assert.ok(res.message.includes('area'));
        assert.ok(res.message.includes('volume'));
      }
    });
  });

  describe('Temperature Boundaries', () => {
    it('rejects temperatures below absolute zero in Kelvin', () => {
      const res = convert({ value: -1, from: 'K', to: 'K' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'INVALID_TEMPERATURE');
      }
    });

    it('rejects temperatures below absolute zero in Celsius', () => {
      const res = convert({ value: -273.16, from: 'degC', to: 'K' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'INVALID_TEMPERATURE');
      }
    });

    it('rejects temperatures below absolute zero in Fahrenheit', () => {
      const res = convert({ value: -459.68, from: 'degF', to: 'K' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'INVALID_TEMPERATURE');
      }
    });

    it('permits absolute zero exactly (-273.15 degC = 0 K)', () => {
      const res = convert({ value: -273.15, from: 'degC', to: 'K' });
      assert.equal(res.ok, true);
      if (res.ok) {
        assertClose(res.result, 0, '-273.15 degC -> 0 K');
      }
    });
  });

  describe('Numeric Limits & Adversarial Inputs', () => {
    it('detects numeric overflow (1e308 mi -> mm)', () => {
      const res = convert({ value: 1e308, from: 'mi', to: 'mm' });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.code, 'NUMERIC_OVERFLOW');
      }
    });

    it('rejects string numerals as INVALID_INPUT', () => {
      const res = convert({ value: '125', from: 'ft', to: 'm' });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.code, 'INVALID_INPUT');
    });

    it('rejects NaN and Infinity as INVALID_INPUT', () => {
      const resNaN = convert({ value: NaN, from: 'ft', to: 'm' });
      assert.equal(resNaN.ok, false);
      if (!resNaN.ok) assert.equal(resNaN.code, 'INVALID_INPUT');

      const resInf = convert({ value: Infinity, from: 'ft', to: 'm' });
      assert.equal(resInf.ok, false);
      if (!resInf.ok) assert.equal(resInf.code, 'INVALID_INPUT');
    });

    it('rejects oversized unit identifiers (>32 code points)', () => {
      const longUnit = 'a'.repeat(33);
      const res = convert({ value: 1, from: longUnit, to: 'm' });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.code, 'INVALID_INPUT');
    });

    it('rejects control characters in unit strings', () => {
      const res = convert({ value: 1, from: 'm\u0000', to: 'km' });
      assert.equal(res.ok, false);
      if (!res.ok) assert.equal(res.code, 'INVALID_INPUT');
    });

    it('operates safely with frozen input objects', () => {
      const req = Object.freeze({ value: 5, from: 'm', to: 'km' });
      const res = convert(req);
      assert.equal(res.ok, true);
      if (res.ok) assert.equal(res.result, 0.005);
    });
  });
});
