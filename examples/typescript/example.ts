import { convert, describeUnit, listUnits } from '@raxocode/unit-verify';

console.log('--- 1. Valid Linear Conversion ---');
const ftToM = convert({ value: 125, from: 'ft', to: 'm' });
if (ftToM.ok) {
  console.log(`125 ft = ${ftToM.result} ${ftToM.unit} (${ftToM.calculation.kind})`);
}

console.log('\n--- 2. Ambiguity Detection ---');
const tonRes = convert({ value: 12, from: 'ton', to: 'kg' });
if (!tonRes.ok) {
  console.log(`Code: ${tonRes.code}`);
  console.log(`Message: ${tonRes.message}`);
  console.log(`Deterministic choices:`, tonRes.choices);
}

console.log('\n--- 3. Dimension Mismatch Detection ---');
const mismatch = convert({ value: 50, from: 'kN', to: 'kg' });
if (!mismatch.ok) {
  console.log(`Code: ${mismatch.code}`);
  console.log(`Message: ${mismatch.message}`);
}

console.log('\n--- 4. Affine Temperature Conversion ---');
const tempRes = convert({ value: 100, from: 'degC', to: 'degF' });
if (tempRes.ok) {
  console.log(`100 °C = ${tempRes.result} ${tempRes.unit} (scale: ${tempRes.calculation.scale}, offset: ${tempRes.calculation.offset})`);
}

console.log('\n--- 5. Unit Metadata Discovery ---');
const psiDesc = describeUnit('psi');
if (psiDesc.ok) {
  console.log(`PSI: dimension=${psiDesc.unit.dimension}, toBaseScale=${psiDesc.unit.toBaseScale}`);
  console.log(`Aliases: ${psiDesc.unit.aliases.join(', ')}`);
}

const speedUnits = listUnits({ dimension: 'speed' });
console.log(`\nFound ${speedUnits.length} speed units:`, speedUnits.map((u) => u.id).join(', '));
