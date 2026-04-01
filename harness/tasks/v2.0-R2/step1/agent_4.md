# A4-Specialist Independent Analysis -- v2.0-R2

## Convergence Score: 8

## Compiler Domain Analysis

### Import Resolution as Graph Problem
- Files are nodes, imports are directed edges
- Circular detection = cycle detection in DFS
- Key insight: ancestor set (current DFS path) vs visited set (all seen files) serve different purposes
  - Ancestor set: cycle detection — only nodes on current path
  - Visited/cache: parse-once optimization — all parsed files
  - A global visited set would incorrectly reject diamond imports (A→B→D and A→C→D)

### Comparison with Other Languages
- **Rust `use`**: Named imports from modules, no re-export by default. Graft follows this model.
- **ES Modules**: Named imports + re-exports. Graft explicitly prohibits re-export.
- **Go**: Package-level imports, no selective name imports. Different model.
- **C `#include`**: Text inclusion, no name extraction. Fundamentally different.

### Key Design Decisions
1. **Resolver class** with FileReader injection (constructor param)
2. **Ancestor set as parameter** to resolveFile (not instance field) — critical for correctness in DFS
3. **Parse cache as instance field** — shared across all resolution paths
4. **RAW program for name lookup** — prevents transitive re-export
5. **Levenshtein distance** for typo suggestions in "name not found" errors
6. **`.gft` auto-extension** — if path doesn't end with `.gft`, try appending it
7. **Mutation-based merging** — consistent with T3 ratchet (mutable AST)
8. **Error accumulation** — consistent with analyzer pattern (T5)

## Implementation Sketch

```typescript
export class Resolver {
  private parseCache = new Map<string, Program>();
  
  constructor(private readonly readFile: FileReader) {}

  resolve(source: string, sourceFile: string): ResolveResult {
    const absPath = path.resolve(sourceFile);
    const program = this.parseSource(source);
    this.parseCache.set(absPath, program);
    
    const errors: GraftError[] = [];
    const resolvedFiles = [absPath];
    const allNames = new Map<string, string>();
    
    // Register local names
    for (const c of program.contexts) allNames.set(c.name, absPath);
    for (const n of program.nodes) allNames.set(n.name, absPath);
    
    // Resolve with ancestor set as parameter
    this.resolveImports(program, absPath, new Set([absPath]), allNames, resolvedFiles, errors);
    
    return { program, resolvedFiles, errors };
  }

  private resolveImports(
    program: Program, currentFile: string,
    ancestors: Set<string>,  // parameter, not field!
    allNames: Map<string, string>,
    resolvedFiles: string[], errors: GraftError[],
  ): void {
    for (const imp of program.imports) {
      const target = path.resolve(path.dirname(currentFile), imp.path);
      imp.resolvedPath = target;

      if (ancestors.has(target)) {
        errors.push(new GraftError(`Circular import: ${[...ancestors, target].map(p => path.basename(p)).join(' -> ')}`, imp.location));
        continue;
      }

      let raw = this.parseCache.get(target);
      if (!raw) {
        // Parse, cache, recurse
        let src: string;
        try { src = this.readFile(target); } catch {
          errors.push(new GraftError(`File not found: ${imp.path}`, imp.location));
          continue;
        }
        raw = this.parseSource(src);
        this.parseCache.set(target, raw);
        resolvedFiles.push(target);

        ancestors.add(target);
        this.resolveImports(raw, target, ancestors, allNames, resolvedFiles, errors);
        ancestors.delete(target);
      }

      // Lookup from RAW parse (no transitive re-export)
      const ctxMap = new Map(raw.contexts.map(c => [c.name, c]));
      const nodeMap = new Map(raw.nodes.map(n => [n.name, n]));

      for (const name of imp.names) {
        if (allNames.has(name)) {
          errors.push(new GraftError(`Duplicate '${name}' (from ${path.basename(allNames.get(name)!)})`, imp.location));
          continue;
        }
        const ctx = ctxMap.get(name);
        const node = nodeMap.get(name);
        if (ctx) { allNames.set(name, target); program.contexts.push(ctx); }
        else if (node) { allNames.set(name, target); program.nodes.push(node); }
        else {
          const available = [...ctxMap.keys(), ...nodeMap.keys()];
          // Levenshtein suggestion
          const hint = available.length > 0 ? `. Available: ${available.join(', ')}` : '';
          errors.push(new GraftError(`'${name}' not found in ${imp.path}${hint}`, imp.location));
        }
      }
    }
  }
}
```

## Trade-offs
- Pros: Class encapsulates parse cache, ancestor-as-parameter is compiler-textbook, Levenshtein adds UX value
- Cons: Class is more ceremony than needed for single-use. Levenshtein might be YAGNI.
- The ancestor set MUST be a parameter, not an instance field. This is the critical compiler insight that prevents diamond imports from being falsely rejected.
