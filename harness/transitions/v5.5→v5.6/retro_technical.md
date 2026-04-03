# v5.5 → v5.6 Technical Retrospective

## Summary

v5.6 expands the example suite with 3 practical pipelines and verifies the complete CLI workflow (init → compile → run). All 7 compilable examples pass compilation and dry-run.

## What Changed

### R1: 3 new practical examples
- **content-pipeline.gft**: 4-node sequential with memory (Researcher → Drafter → Editor → MetadataExtractor). Demonstrates memory reads/writes, edge transforms, Opus model for editing.
- **data-analysis.gft**: seq→parallel→seq pattern (Classifier → parallel{StatAnalyzer, TrendAnalyzer} → ReportWriter). The most complex flow pattern after adversarial-debate.gft. Validates that Classifier→parallel edges and parallel→ReportWriter edges both generate correct transformed input paths.
- **pr-summarizer.gft**: Minimal practical pipeline (Analyzer → Formatter). Designed for daily use — reads PR diffs, produces structured summary.

### R2: Full CLI workflow verification
- `graft init /tmp/demo` → creates scaffold with working pipeline.gft
- `graft compile pipeline.gft` → generates .claude/ structure
- `graft run pipeline.gft --dry-run` → simulates execution
- `graft check data-analysis.gft` → validates without writing
- All 7 compilable examples pass both compile and dry-run

### Fix: gitignore for subdirectory runtime output
- Added `**/.graft/session/` and `**/.graft/token_log.txt` patterns
- Removed accidentally committed dry-run artifacts from examples/

## Key Findings
- seq→parallel→seq (data-analysis.gft) works perfectly: Classifier output is edge-transformed separately for StatAnalyzer and TrendAnalyzer, then both transformed outputs are correctly listed for ReportWriter
- content-pipeline.gft with memory correctly generates .graft/memory/ scaffold and includes Memory Saving section in MetadataExtractor agent
- adversarial-debate.gft (8 nodes, 120k budget) exceeds budget at 133k best case — compiles with warnings, which is correct behavior

## Files Changed

| File | Change |
|------|--------|
| `examples/content-pipeline.gft` | New — 4-node memory pipeline |
| `examples/data-analysis.gft` | New — seq→par→seq analysis pipeline |
| `examples/pr-summarizer.gft` | New — minimal PR summary pipeline |
| `tests/integration.test.ts` | 5 new tests for all examples |
| `.gitignore` | Added `**/.graft/` patterns |
