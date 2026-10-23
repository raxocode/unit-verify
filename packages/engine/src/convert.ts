import type { ConversionRequest, ConversionResponse, Dimension, ErrorCode } from './types.js';
import { CATALOG_VERSION } from './units.js';
import { resolveUnit } from './resolve.js';

const KELVIN_ROUNDING_TOLERANCE = -1e-9;

function makeErrorResponse(code: ErrorCode, message: string, choices?: string[]): ConversionResponse {
  return {
    ok: false,
    schemaVersion: '1',
    catalogVersion: CATALOG_VERSION,
    code,
    message,
    ...(choices ? { choices } : {}),
  };
}

export function convert(request: ConversionRequest): ConversionResponse {
  // 1. Basic structural validation of request
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return makeErrorResponse('INVALID_INPUT', 'Request must be a non-null object');
  }

  const { value, from, to } = request;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return makeErrorResponse(
      'INVALID_INPUT',
      `Value must be a finite number; received ${typeof value === 'number' ? String(value) : typeof value}`,
    );
  }

  // 2. Resolve 'from' unit
  const resolvedFrom = resolveUnit(from);
  if (!resolvedFrom.ok) {
    return makeErrorResponse(resolvedFrom.code, resolvedFrom.message, resolvedFrom.choices);
  }

  // 3. Resolve 'to' unit
  const resolvedTo = resolveUnit(to);
  if (!resolvedTo.ok) {
    return makeErrorResponse(resolvedTo.code, resolvedTo.message, resolvedTo.choices);
  }

  const unitFrom = resolvedFrom.resolved.unit;
  const unitTo = resolvedTo.resolved.unit;

  // 4. Dimensional compatibility check
  if (unitFrom.dimension !== unitTo.dimension) {
    return makeErrorResponse(
      'DIMENSION_MISMATCH',
      `Cannot convert between incompatible dimensions: '${unitFrom.dimension}' (${unitFrom.id}) and '${unitTo.dimension}' (${unitTo.id})`,
    );
  }

  const dimension: Dimension = unitFrom.dimension;
  const sourceIds = Array.from(new Set([...unitFrom.sourceIds, ...unitTo.sourceIds]));

  // 5. Dimension-specific calculation
  if (resolvedFrom.resolved.kind === 'linear' && resolvedTo.resolved.kind === 'linear') {
    const fromLinear = resolvedFrom.resolved.unit;
    const toLinear = resolvedTo.resolved.unit;
    const scale = fromLinear.toBaseScale / toLinear.toBaseScale;
    if (!Number.isFinite(scale)) {
      return makeErrorResponse('NUMERIC_OVERFLOW', 'Scale factor exceeds IEEE-754 binary64 range');
    }

    // Direct same-unit shortcut to prevent floating-point drift
    let result = unitFrom.id === unitTo.id ? value : value * scale;

    if (!Number.isFinite(result)) {
      return makeErrorResponse('NUMERIC_OVERFLOW', 'Conversion result exceeds IEEE-754 binary64 range');
    }

    if (value !== 0 && result === 0) {
      return makeErrorResponse(
        'PRECISION_UNDERFLOW',
        'Conversion result underflowed to zero in IEEE-754 binary64 representation',
      );
    }

    return {
      ok: true,
      schemaVersion: '1',
      catalogVersion: CATALOG_VERSION,
      input: { value, from, to },
      result,
      unit: unitTo.id,
      dimension,
      calculation: {
        kind: 'linear',
        scale,
        offset: 0,
      },
      sourceIds,
      warnings: [],
    };
  }

  if (resolvedFrom.resolved.kind === 'temperature' && resolvedTo.resolved.kind === 'temperature') {
    const fromId = unitFrom.id;
    const toId = unitTo.id;

    // Convert input to Kelvin to validate absolute physical limit
    let kelvin: number;
    if (fromId === 'K') {
      kelvin = value;
    } else if (fromId === 'degC') {
      kelvin = value + 273.15;
    } else {
      // degF
      kelvin = (value + 459.67) * (5 / 9);
    }

    if (kelvin < KELVIN_ROUNDING_TOLERANCE) {
      return makeErrorResponse(
        'INVALID_TEMPERATURE',
        `Temperature value ${value} ${unitFrom.id} corresponds to physically impossible negative absolute temperature (${kelvin.toFixed(4)} K)`,
      );
    }

    // Guard small float rounding near zero Kelvin
    if (kelvin < 0) {
      kelvin = 0;
    }

    // Derive affine scale and offset for (from -> to) pair: result = value * scale + offset
    let scale: number;
    let offset: number;
    let result: number;

    if (fromId === toId) {
      scale = 1;
      offset = 0;
      result = value;
    } else if (fromId === 'degC' && toId === 'K') {
      scale = 1;
      offset = 273.15;
      result = value + 273.15;
    } else if (fromId === 'K' && toId === 'degC') {
      scale = 1;
      offset = -273.15;
      result = value - 273.15;
    } else if (fromId === 'degC' && toId === 'degF') {
      scale = 9 / 5;
      offset = 32;
      result = value * (9 / 5) + 32;
    } else if (fromId === 'degF' && toId === 'degC') {
      scale = 5 / 9;
      offset = -32 * (5 / 9);
      result = (value - 32) * (5 / 9);
    } else if (fromId === 'degF' && toId === 'K') {
      scale = 5 / 9;
      offset = 459.67 * (5 / 9);
      result = (value + 459.67) * (5 / 9);
    } else if (fromId === 'K' && toId === 'degF') {
      scale = 9 / 5;
      offset = -459.67;
      result = value * (9 / 5) - 459.67;
    } else {
      scale = 1;
      offset = 0;
      result = value;
    }

    if (!Number.isFinite(result)) {
      return makeErrorResponse('NUMERIC_OVERFLOW', 'Temperature result exceeds IEEE-754 binary64 range');
    }

    return {
      ok: true,
      schemaVersion: '1',
      catalogVersion: CATALOG_VERSION,
      input: { value, from, to },
      result,
      unit: unitTo.id,
      dimension,
      calculation: {
        kind: 'affine',
        scale,
        offset,
      },
      sourceIds,
      warnings: [],
    };
  }

  return makeErrorResponse('INVALID_INPUT', 'Unsupported conversion configuration');
}
