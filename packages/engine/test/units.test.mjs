import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_VERSION,
  LINEAR_UNITS,
  TEMPERATURE_UNITS,
  AMBIGUOUS_UNITS,
  listUnits,
  describeUnit,
  DIMENSIONS,
} from '../dist/index.js';

describe('Unit Catalog & Definition Integrity', () => {
  it('has exact catalog version', () => {
    assert.equal(CATALOG_VERSION, '1.0.0');
  });

  it('contains exactly 51 canonical units across 10 dimensions', () => {
    const totalCount = LINEAR_UNITS.length + TEMPERATURE_UNITS.length;
    assert.equal(totalCount, 51, `Expected 51 canonical units, got ${totalCount}`);

    const allUnits = listUnits();
    assert.equal(allUnits.length, 51);

    // Dimension breakdown check
    const counts = {};
    for (const u of allUnits) {
      counts[u.dimension] = (counts[u.dimension] || 0) + 1;
    }
    assert.equal(counts.length, 8);
    assert.equal(counts.mass, 8);
    assert.equal(counts.area, 5);
    assert.equal(counts.volume, 6);
    assert.equal(counts.time, 4);
    assert.equal(counts.speed, 4);
    assert.equal(counts.force, 3);
    assert.equal(counts.pressure, 4);
    assert.equal(counts.temperature, 3);
    assert.equal(counts.information, 6);
  });

  it('has unique canonical IDs with no duplicates', () => {
    const ids = new Set();
    for (const u of LINEAR_UNITS) {
      assert.ok(!ids.has(u.id), `Duplicate ID in linear units: ${u.id}`);
      ids.add(u.id);
    }
    for (const u of TEMPERATURE_UNITS) {
      assert.ok(!ids.has(u.id), `Duplicate ID in temperature units: ${u.id}`);
      ids.add(u.id);
    }
  });

  it('all linear units have strictly positive, finite scale factors', () => {
    for (const u of LINEAR_UNITS) {
      assert.ok(Number.isFinite(u.toBaseScale), `Scale for ${u.id} is not finite`);
      assert.ok(u.toBaseScale > 0, `Scale for ${u.id} must be strictly positive`);
    }
  });

  it('all units have valid source citations and aliases', () => {
    for (const u of [...LINEAR_UNITS, ...TEMPERATURE_UNITS]) {
      assert.ok(u.sourceIds.length > 0, `Unit ${u.id} must have at least one citation`);
      assert.ok(u.aliases.length > 0, `Unit ${u.id} must have at least one alias`);
      assert.ok(u.name.length > 0);
      assert.ok(u.symbol.length > 0);
    }
  });

  it('listUnits returns immutable data copies and deterministic order', () => {
    const units1 = listUnits();
    const units2 = listUnits();
    assert.deepEqual(units1, units2);

    // Mutating returned object does not affect internal catalog
    units1[0].aliases.push('hacked');
    const units3 = listUnits();
    assert.ok(!units3[0].aliases.includes('hacked'));
  });

  it('listUnits filters by dimension correctly', () => {
    const speedUnits = listUnits({ dimension: 'speed' });
    assert.equal(speedUnits.length, 4);
    for (const u of speedUnits) {
      assert.equal(u.dimension, 'speed');
    }
  });

  it('describeUnit describes canonical and alias lookups', () => {
    const resM = describeUnit('m');
    assert.equal(resM.ok, true);
    if (resM.ok) {
      assert.equal(resM.unit.id, 'm');
      assert.equal(resM.unit.dimension, 'length');
      assert.equal(resM.unit.toBaseScale, 1);
    }

    const resAlias = describeUnit('kilometer');
    assert.equal(resAlias.ok, true);
    if (resAlias.ok) {
      assert.equal(resAlias.unit.id, 'km');
    }

    const resUnknown = describeUnit('nonexistent_unit');
    assert.equal(resUnknown.ok, false);
    if (!resUnknown.ok) {
      assert.equal(resUnknown.code, 'UNKNOWN_UNIT');
    }
  });

  it('curated ambiguous terms are mapped deterministically', () => {
    assert.deepEqual(AMBIGUOUS_UNITS.ton, ['tonne', 'ton_us', 'ton_uk']);
    assert.deepEqual(AMBIGUOUS_UNITS.gallon, ['gal_us', 'gal_uk']);
    assert.deepEqual(AMBIGUOUS_UNITS['fl oz'], ['gal_us', 'gal_uk']);

    const resAmbiguous = describeUnit('ton');
    assert.equal(resAmbiguous.ok, false);
    if (!resAmbiguous.ok) {
      assert.equal(resAmbiguous.code, 'AMBIGUOUS_UNIT');
      assert.deepEqual(resAmbiguous.choices, ['tonne', 'ton_us', 'ton_uk']);
    }
  });

  it('case-sensitivity is preserved for single-letter symbols', () => {
    const resB = describeUnit('B'); // byte
    assert.equal(resB.ok, true);
    if (resB.ok) assert.equal(resB.unit.id, 'B');

    const resM = describeUnit('m'); // meter
    assert.equal(resM.ok, true);
    if (resM.ok) assert.equal(resM.unit.id, 'm');

    const resCapitalM = describeUnit('M'); // unknown
    assert.equal(resCapitalM.ok, false);
    if (!resCapitalM.ok) assert.equal(resCapitalM.code, 'UNKNOWN_UNIT');
  });
});
