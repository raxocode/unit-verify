import type {
  Dimension,
  TemperatureDefinition,
  UnitDefinition,
  UnitDescription,
  UnitLookupResponse,
} from './types.js';
import { AMBIGUOUS_UNITS, LINEAR_UNITS, TEMPERATURE_UNITS } from './units.js';

export const DIMENSIONS: readonly Dimension[] = [
  'length',
  'mass',
  'area',
  'volume',
  'time',
  'speed',
  'force',
  'pressure',
  'temperature',
  'information',
];

export type ResolvedUnit =
  | { kind: 'linear'; unit: UnitDefinition }
  | { kind: 'temperature'; unit: TemperatureDefinition };

export type ResolveResult =
  | { ok: true; resolved: ResolvedUnit }
  | {
      ok: false;
      code: 'INVALID_INPUT' | 'AMBIGUOUS_UNIT' | 'UNKNOWN_UNIT';
      message: string;
      choices?: string[];
    };

// Control characters check (ASCII 0x00-0x1F and 0x7F-0x9F)
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F-\u009F]/;

// Fast lookup structures
const LINEAR_BY_ID = new Map<string, UnitDefinition>();
const TEMP_BY_ID = new Map<string, TemperatureDefinition>();

for (const unit of LINEAR_UNITS) {
  LINEAR_BY_ID.set(unit.id, unit);
}
for (const unit of TEMPERATURE_UNITS) {
  TEMP_BY_ID.set(unit.id, unit);
}

export function validateUnitString(name: unknown): { ok: true; trimmed: string } | { ok: false; message: string } {
  if (typeof name !== 'string') {
    return { ok: false, message: 'Unit identifier must be a string' };
  }
  const trimmed = name.trim();
  if (trimmed === '') {
    return { ok: false, message: 'Unit identifier cannot be empty' };
  }
  // Max 32 Unicode code points
  const codePointCount = Array.from(trimmed).length;
  if (codePointCount > 32) {
    return {
      ok: false,
      message: `Unit identifier exceeds maximum length of 32 code points (got ${codePointCount})`,
    };
  }
  if (CONTROL_CHAR_REGEX.test(trimmed)) {
    return { ok: false, message: 'Unit identifier contains forbidden control characters' };
  }
  return { ok: true, trimmed };
}

export function resolveUnit(rawName: unknown): ResolveResult {
  const validation = validateUnitString(rawName);
  if (!validation.ok) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message: validation.message,
    };
  }

  const query = validation.trimmed;
  const lowerQuery = query.toLowerCase();

  // 1. Ambiguity check has priority before unknown unit or dimension mismatch
  if (Object.prototype.hasOwnProperty.call(AMBIGUOUS_UNITS, lowerQuery)) {
    const choices = [...AMBIGUOUS_UNITS[lowerQuery]];
    return {
      ok: false,
      code: 'AMBIGUOUS_UNIT',
      message: `Unit '${query}' is ambiguous. Please specify one of: ${choices.join(', ')}`,
      choices,
    };
  }

  // 2. Case-sensitive exact ID lookup
  const linearById = LINEAR_BY_ID.get(query);
  if (linearById) {
    return { ok: true, resolved: { kind: 'linear', unit: linearById } };
  }
  const tempById = TEMP_BY_ID.get(query);
  if (tempById) {
    return { ok: true, resolved: { kind: 'temperature', unit: tempById } };
  }

  // 3. Exact case-sensitive alias match
  for (const unit of LINEAR_UNITS) {
    if (unit.aliases.includes(query)) {
      return { ok: true, resolved: { kind: 'linear', unit } };
    }
  }
  for (const unit of TEMPERATURE_UNITS) {
    if (unit.aliases.includes(query)) {
      return { ok: true, resolved: { kind: 'temperature', unit } };
    }
  }

  // 4. Case-insensitive lookup for word aliases only (length > 1, not single-letter symbols like 'M')
  if (lowerQuery.length > 1) {
    for (const unit of LINEAR_UNITS) {
      for (const alias of unit.aliases) {
        if (alias.length > 1 && alias.toLowerCase() === lowerQuery) {
          return { ok: true, resolved: { kind: 'linear', unit } };
        }
      }
    }
    for (const unit of TEMPERATURE_UNITS) {
      for (const alias of unit.aliases) {
        if (alias.length > 1 && alias.toLowerCase() === lowerQuery) {
          return { ok: true, resolved: { kind: 'temperature', unit } };
        }
      }
    }
  }

  return {
    ok: false,
    code: 'UNKNOWN_UNIT',
    message: `Unknown unit identifier: '${query}'`,
  };
}

export function toUnitDescription(resolved: ResolvedUnit): UnitDescription {
  const { unit } = resolved;
  const desc: UnitDescription = {
    id: unit.id,
    dimension: unit.dimension,
    name: unit.name,
    symbol: unit.symbol,
    sourceIds: [...unit.sourceIds],
    aliases: [...unit.aliases],
  };
  if (resolved.kind === 'linear') {
    desc.toBaseScale = resolved.unit.toBaseScale;
  }
  return desc;
}

export function describeUnit(name: string): UnitLookupResponse {
  const res = resolveUnit(name);
  if (!res.ok) {
    return {
      ok: false,
      code: res.code,
      message: res.message,
      ...(res.choices ? { choices: res.choices } : {}),
    };
  }
  return {
    ok: true,
    unit: toUnitDescription(res.resolved),
  };
}

export function listUnits(options?: { dimension?: Dimension }): UnitDescription[] {
  const requestedDim = options?.dimension;
  const results: UnitDescription[] = [];

  const dimRank = new Map<Dimension, number>();
  DIMENSIONS.forEach((d, idx) => dimRank.set(d, idx));

  for (const unit of LINEAR_UNITS) {
    if (!requestedDim || unit.dimension === requestedDim) {
      results.push(toUnitDescription({ kind: 'linear', unit }));
    }
  }
  for (const unit of TEMPERATURE_UNITS) {
    if (!requestedDim || unit.dimension === requestedDim) {
      results.push(toUnitDescription({ kind: 'temperature', unit }));
    }
  }

  results.sort((a, b) => {
    const rankDiff = (dimRank.get(a.dimension) ?? 0) - (dimRank.get(b.dimension) ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return a.id.localeCompare(b.id);
  });

  return results;
}
