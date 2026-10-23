# Agent Guidelines for unit-verify

This repository implements the offline-first unit conversion and verification tool.

Key principles:
1. Pure ECMAScript core with zero runtime dependencies.
2. Centralized mathematical conversions; CLI and MCP adapters consume exported functions without duplicating calculations.
3. Strict batch resource safety: 10,000 in-memory batch cap, 100,000 CLI streaming batch cap, 16 KiB max line length.
4. Deterministic structured errors: no silent guesses or reclassification.
