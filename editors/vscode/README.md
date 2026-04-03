# Graft for VS Code

Language support for [Graft](https://www.npmjs.com/package/@jsleekr/graft) `.gft` files — a graph-native language for defining multi-agent LLM pipelines.

## Features

- **Syntax highlighting** — full TextMate grammar for `.gft` files
- **Diagnostics** — real-time parse errors, scope checks, type checks
- **Hover** — type info and documentation on hover
- **Go to Definition** — jump to context, node, memory declarations
- **Find References** — find all usages of a symbol
- **Rename** — rename symbols across the file
- **Completions** — context-aware suggestions for keywords, types, and references
- **Code Actions** — quick fixes for common issues

## Requirements

Install the Graft CLI globally:

```bash
npm install -g @jsleekr/graft
```

The extension uses `graft-lsp` (included with the CLI) as the language server.

## Getting Started

1. Install this extension
2. Open a `.gft` file
3. The language server starts automatically

Example `.gft` file:

```graft
context Input(max_tokens: 500) {
  question: String
}

node Analyst(model: sonnet, budget: 2500/2000) {
  reads: [Input]
  produces Analysis {
    answer: String
    confidence: Float(0..1)
  }
}

graph Demo(input: Input, output: Analysis, budget: 10000) {
  Analyst -> done
}
```

## Links

- [npm package](https://www.npmjs.com/package/@jsleekr/graft)
- [GitHub](https://github.com/JSLEEKR/graft)
