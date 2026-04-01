# A3-Skeptic Cross-Critique — v1.2

## Key Catches
- A4's generateAgent() reuse is WRONG: produces markdown with sentinels for manual mode, not for programmatic stdout JSON
- A1's fallback node gap: nodeMap built from FlowNode[] won't contain fallback-only nodes. Must build from Program.nodes
- A2's no-timeout means pipeline hangs forever on API outage
- A2's Promise.all for parallel = silent data loss on first failure

## Revised Approach (score raised to 7)
- Build nodeMap from Program.nodes (not FlowNode[]) to support fallback nodes
- Promise.allSettled non-negotiable
- Subprocess timeout: 5 min default, configurable
- Session cleanup before each run
- Separate runtime prompt builder (not generateAgent())
- JSON extraction: direct parse + first-brace-to-last-brace fallback
- Deprioritized: command injection, Windows reserved names, prototype pollution
