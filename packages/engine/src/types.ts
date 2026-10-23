export type Dimension =
  | 'length'
  | 'mass'
  | 'area'
  | 'volume'
  | 'time'
  | 'speed'
  | 'force'
  | 'pressure'
  | 'temperature'
  | 'information';

export interface ConversionRequest {
  value: number;
  from: string;
  to: string;
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_UNIT'
  | 'AMBIGUOUS_UNIT'
  | 'DIMENSION_MISMATCH'
  | 'INVALID_TEMPERATURE'
  | 'NUMERIC_OVERFLOW'
  | 'PRECISION_UNDERFLOW';

export type ConversionResponse =
  | {
      ok: true;
      schemaVersion: '1';
      catalogVersion: string;
      input: { value: number; from: string; to: string };
      result: number;
      unit: string;
      dimension: Dimension;
      calculation: { kind: 'linear' | 'affine'; scale: number; offset: number };
      sourceIds: string[];
      warnings: string[];
    }
  | {
      ok: false;
      schemaVersion: '1';
      catalogVersion: string;
      code: ErrorCode;
      message: string;
      choices?: string[];
    };

export type BatchResponse =
  | { ok: true; results: ConversionResponse[]; total: number; failures: number }
  | { ok: false; code: 'BATCH_LIMIT' | 'INVALID_INPUT'; message: string };

export interface UnitDescription {
  id: string;
  dimension: Dimension;
  name: string;
  symbol: string;
  toBaseScale?: number;
  sourceIds: string[];
  aliases: string[];
}

export type UnitLookupResponse =
  | { ok: true; unit: UnitDescription }
  | {
      ok: false;
      code: 'UNKNOWN_UNIT' | 'AMBIGUOUS_UNIT' | 'INVALID_INPUT';
      message: string;
      choices?: string[];
    };

export interface UnitDefinition {
  id: string;
  symbol: string;
  name: string;
  dimension: Dimension;
  toBaseScale: number;
  aliases: readonly string[];
  sourceIds: readonly string[];
}

export interface TemperatureDefinition {
  id: string;
  symbol: string;
  name: string;
  dimension: 'temperature';
  toKelvin: { scale: number; offset: number }; // K = input * scale + offset
  fromKelvin: { scale: number; offset: number }; // result = (K + offset) * scale or K * scale + offset
  aliases: readonly string[];
  sourceIds: readonly string[];
}
