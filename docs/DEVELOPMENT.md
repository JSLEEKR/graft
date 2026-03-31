# Development Process

This document describes the benchmark-driven development workflow for the Graft compiler.

## Benchmark-Driven Development Process

Benchmarks are the primary feedback loop for compiler development. Every change to the compiler is validated against a suite of `.gft` benchmark files that exercise the lexer, parser, semantic analyzer, and code generator.

### Running Benchmarks

Run the full benchmark suite:

```bash
npm run bench
```

**How to read results:**

- Each benchmark file is compiled through all compiler phases.
- The output reports pass/fail status per file, along with timing information.
- Failures include a diff between expected and actual output, plus any error messages from the compiler.

**Where results are stored:**

- Benchmark results are written to `benchmarks/results/` as JSON files.
- Each run is timestamped so you can compare results across dates.
- Raw `.gft` benchmark source files live in `benchmarks/`.

### When a Benchmark Fails

Follow this step-by-step process:

1. **Create a GitHub Issue** using the [Benchmark Bug Report](.github/ISSUE_TEMPLATE/benchmark-bug.yml) template. Fill in the benchmark file, expected vs. actual behavior, error output, severity, and compiler phase.

2. **Create a branch** from `main`:
   ```bash
   git checkout -b fix/bench-{issue-number}-{short-desc}
   ```

3. **Write a regression test first.** Add a test in `tests/` that reproduces the failure. Confirm it fails before writing the fix.

4. **Fix the bug using DEBUG mode.** Enable verbose logging as described in `.claude/CLAUDE.md` to trace the compiler's behavior through each phase.

5. **Run benchmarks again** to confirm the fix resolves the failure and does not introduce regressions:
   ```bash
   npm run bench
   ```

6. **Create a Pull Request** linking the issue. Include the benchmark diff (before/after) in the PR description.

7. **Merge and close** the issue once the PR is approved and CI passes.

### When Adding New Language Features

1. **Create a GitHub Issue** using the [Improvement](.github/ISSUE_TEMPLATE/improvement.yml) template. Specify the area (grammar, codegen, analyzer, or cli), motivation, and proposed solution.

2. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/{feature-name}
   ```

3. **Add a benchmark `.gft` file** that exercises the new feature. Place it in `benchmarks/` with a descriptive name.

4. **Run through the adversarial debate harness** in CREATE mode to stress-test the feature design and surface edge cases.

5. **Run all benchmarks** to verify the new feature does not break existing functionality:
   ```bash
   npm run bench
   ```

6. **Create a Pull Request** with a description of the feature, its grammar changes (if any), and benchmark results.

### Version History

- Each benchmark run is recorded in `benchmarks/results/` as a timestamped JSON file.
- The git log shows the evolution of fixes and features over time.
- GitHub Issues and Pull Requests create a reviewable history of every change.

### Reviewing Progress

- **Compare benchmark results across dates:** Diff the JSON files in `benchmarks/results/` to see quantitative improvement over time.
- **GitHub Issues:** Filter by label (`benchmark`, `bug`, `enhancement`) to see open work and resolved problems.
- **GitHub PRs:** Each PR links to an issue and shows the exact fix or feature that was shipped.
- **`benchmarks/results/*.json`:** Machine-readable progress tracking for automated reporting.
