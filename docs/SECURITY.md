# Security and Privacy Policy

## Core Privacy Principles

1. **100% Offline by Default**: The core library, CLI, and MCP adapter perform **zero outbound network requests**. There is no telemetry, no tracking pixel, no analytics beacon, and no cloud dependency.
2. **Zero Inbound Ports**: The CLI and MCP tools communicate exclusively over local standard input and output (`stdio`). No TCP or HTTP sockets are ever opened.
3. **No Code Execution**: User input is strictly parsed as data. We never execute `eval()`, `new Function()`, shell commands, or dynamic code from input strings.
4. **Memory & CPU Bounds**: Rigid caps prevent denial-of-service or host starvation:
   - Line buffer capped at 16 KiB.
   - Batch limits enforced before execution.
   - Prototype pollution protections against malicious keys like `__proto__`.

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in RaxoCode Unit Verify:

1. Please do **not** open a public GitHub issue.
2. Privately submit an advisory via GitHub Security Advisories on the repository (`https://github.com/raxocode/unit-verify/security/advisories`).
3. Include a minimal reproduction script and affected versions.
4. Maintainers will acknowledge within 48 hours and coordinate a coordinated disclosure timeline.
