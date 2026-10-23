# Contributing to RaxoCode Unit Verify

Thank you for your interest in contributing! This project is an open-source, offline-first tool dedicated to correct, verified unit conversions.

## Development Setup

Requirements:
- Node.js `>=20.0.0` (Node 22 LTS recommended)
- `pnpm` `>=9.0.0` (or `npm`)

```bash
# Clone the repository
git clone https://github.com/raxocode/unit-verify.git
cd unit-verify

# Install workspace dependencies
pnpm install

# Build all packages
pnpm build

# Run full test suite
pnpm test
pnpm run test:integration
pnpm run package:smoke
```

---

## Guidelines for Proposing New Units

We welcome additions to the unit catalog, provided they adhere to our strict verification policy:

1. **Authoritative Citation**: The conversion factor must be accompanied by a citation from an official standards body (e.g., NIST, BIPM, ISO, IEC).
2. **Ambiguity Analysis**: If the unit term has competing definitions (e.g. US vs Imperial, avoirdupois vs troy), it must either use unambiguous canonical suffixes or be mapped to the ambiguity resolution list.
3. **Tests**: Every new unit must include unit definition tests, golden conversion tests, and round-trip verification.
4. **No Runtime Dependencies**: The core engine must remain zero-dependency and browser-safe.

---

## Running Benchmarks and Quality Checks

```bash
# Type checking
pnpm typecheck

# Linting
pnpm lint

# 100k streaming batch benchmark
pnpm run stress:batch
```

Please ensure all tests and type checks pass before opening a Pull Request.
