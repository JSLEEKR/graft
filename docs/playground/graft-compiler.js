"use strict";
var GraftCompiler = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/playground-entry.ts
  var playground_entry_exports = {};
  __export(playground_entry_exports, {
    compilePlayground: () => compilePlayground
  });

  // src/lexer/tokens.ts
  var KEYWORDS = {
    node: "Node" /* Node */,
    edge: "Edge" /* Edge */,
    graph: "Graph" /* Graph */,
    context: "Context" /* Context */,
    reads: "Reads" /* Reads */,
    produces: "Produces" /* Produces */,
    tools: "Tools" /* Tools */,
    budget: "Budget" /* Budget */,
    model: "Model" /* Model */,
    select: "Select" /* Select */,
    filter: "Filter" /* Filter */,
    drop: "Drop" /* Drop */,
    compact: "Compact" /* Compact */,
    truncate: "Truncate" /* Truncate */,
    when: "When" /* When */,
    else: "Else" /* Else */,
    done: "Done" /* Done */,
    on_failure: "OnFailure" /* OnFailure */,
    retry: "Retry" /* Retry */,
    fallback: "Fallback" /* Fallback */,
    skip: "Skip" /* Skip */,
    abort: "Abort" /* Abort */,
    input: "Input" /* Input */,
    output: "Output" /* Output */,
    max_tokens: "MaxTokens" /* MaxTokens */,
    enum: "Enum" /* Enum */,
    true: "True" /* True */,
    false: "False" /* False */,
    parallel: "Parallel" /* Parallel */,
    foreach: "Foreach" /* Foreach */,
    as: "As" /* As */,
    max_iterations: "MaxIterations" /* MaxIterations */,
    import: "Import" /* Import */,
    from: "From" /* From */,
    memory: "Memory" /* Memory */,
    writes: "Writes" /* Writes */,
    storage: "Storage" /* Storage */,
    let: "Let" /* Let */,
    then: "Then" /* Then */,
    if: "If" /* If */,
    String: "String" /* String */,
    Int: "Int" /* Int */,
    Float: "Float" /* Float */,
    Bool: "Bool" /* Bool */,
    List: "List" /* List */,
    Map: "Map" /* Map */,
    Optional: "Optional" /* Optional */,
    TokenBounded: "TokenBounded" /* TokenBounded */,
    FilePath: "FilePath" /* FilePath */,
    FileDiff: "FileDiff" /* FileDiff */,
    TestFile: "TestFile" /* TestFile */,
    IssueRef: "IssueRef" /* IssueRef */
  };

  // src/errors/diagnostics.ts
  var GraftError = class extends Error {
    constructor(message, location, severity = "error", code, help) {
      super(message);
      this.location = location;
      this.severity = severity;
      this.code = code;
      this.help = help;
      this.name = "GraftError";
    }
    format(source, filename) {
      const lines = source.split("\n");
      const lineIdx = this.location.line - 1;
      const line = lineIdx >= 0 && lineIdx < lines.length ? lines[lineIdx] : "";
      const col = Math.max(0, this.location.column - 1);
      const lineNumStr = String(this.location.line);
      const gutter = " ".repeat(lineNumStr.length);
      const underlineLen = this.location.length && this.location.length > 0 ? this.location.length : 1;
      const underline = "^".repeat(underlineLen);
      const label = this.severity === "warning" ? "warning" : "error";
      const codeStr = this.code ? `[${this.code}]` : "";
      const file = filename || "<source>";
      const result = [
        `${label}${codeStr}: ${this.message}`,
        ` ${gutter}--> ${file}:${this.location.line}:${this.location.column}`,
        ` ${gutter} |`,
        ` ${lineNumStr} | ${line}`,
        ` ${gutter} | ${" ".repeat(col)}${underline}`
      ];
      if (this.help) {
        result.push(` ${gutter} |`);
        result.push(` ${gutter} = help: ${this.help}`);
      }
      return result.join("\n");
    }
  };
  function didYouMean(name, candidates, maxDistance = 3) {
    let best;
    let bestDist = maxDistance + 1;
    for (const candidate of candidates) {
      const dist = levenshtein(name.toLowerCase(), candidate.toLowerCase());
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    return bestDist <= maxDistance ? best : void 0;
  }
  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          curr[j - 1] + 1,
          // insert
          prev[j] + 1,
          // delete
          prev[j - 1] + cost
          // replace
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  // src/lexer/lexer.ts
  var SINGLE_CHAR = {
    "{": "LBrace" /* LBrace */,
    "}": "RBrace" /* RBrace */,
    "(": "LParen" /* LParen */,
    ")": "RParen" /* RParen */,
    "[": "LBracket" /* LBracket */,
    "]": "RBracket" /* RBracket */,
    ":": "Colon" /* Colon */,
    ",": "Comma" /* Comma */,
    ".": "Dot" /* Dot */,
    "|": "Pipe" /* Pipe */,
    "/": "Slash" /* Slash */,
    "*": "Star" /* Star */,
    "%": "Percent" /* Percent */,
    "+": "Plus" /* Plus */,
    "-": "Minus" /* Minus */,
    "!": "Bang" /* Bang */,
    "=": "Equals" /* Equals */,
    ">": "Greater" /* Greater */,
    "<": "Less" /* Less */
  };
  var Lexer = class {
    constructor(source) {
      this.source = source;
    }
    pos = 0;
    line = 1;
    column = 1;
    tokens = [];
    tokenize() {
      this.tokens = [];
      while (this.pos < this.source.length) {
        this.skipWhitespace();
        if (this.pos >= this.source.length) break;
        const ch = this.source[this.pos];
        if (ch === "/" && this.peek(1) === "/") {
          this.skipLineComment();
          continue;
        }
        if (ch === "/" && this.peek(1) === "*") {
          this.skipBlockComment();
          continue;
        }
        if (ch === '"') {
          this.readString();
          continue;
        }
        if (this.isDigit(ch)) {
          this.readNumber();
          continue;
        }
        if (this.isAlpha(ch)) {
          this.readIdentifierOrKeyword();
          continue;
        }
        if (this.readSymbol()) {
          continue;
        }
        throw new GraftError(
          `Unexpected character '${ch}'`,
          this.location()
        );
      }
      this.tokens.push({ type: "EOF" /* EOF */, value: "", location: this.location() });
      return this.tokens;
    }
    skipWhitespace() {
      while (this.pos < this.source.length) {
        const ch = this.source[this.pos];
        if (ch === "\n") {
          this.pos++;
          this.line++;
          this.column = 1;
        } else if (ch === "\r") {
          this.pos++;
          if (this.pos < this.source.length && this.source[this.pos] === "\n") {
            this.pos++;
          }
          this.line++;
          this.column = 1;
        } else if (ch === " " || ch === "	") {
          this.pos++;
          this.column++;
        } else {
          break;
        }
      }
    }
    skipLineComment() {
      this.pos += 2;
      this.column += 2;
      while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
        this.pos++;
        this.column++;
      }
    }
    skipBlockComment() {
      const loc = this.location();
      this.pos += 2;
      this.column += 2;
      while (this.pos < this.source.length) {
        if (this.source[this.pos] === "*" && this.peek(1) === "/") {
          this.pos += 2;
          this.column += 2;
          return;
        }
        if (this.source[this.pos] === "\n") {
          this.line++;
          this.column = 1;
          this.pos++;
        } else {
          this.pos++;
          this.column++;
        }
      }
      throw new GraftError("Unterminated block comment", loc);
    }
    readString() {
      const loc = this.location();
      this.pos++;
      this.column++;
      let value = "";
      let hasInterpolation = false;
      while (this.pos < this.source.length && this.source[this.pos] !== '"') {
        if (this.source[this.pos] === "\n") {
          throw new GraftError("Unterminated string literal", loc);
        }
        if (this.source[this.pos] === "\\" && this.pos + 1 < this.source.length && this.source[this.pos + 1] === "$" && this.pos + 2 < this.source.length && this.source[this.pos + 2] === "{") {
          value += "${";
          this.pos += 3;
          this.column += 3;
          continue;
        }
        if (this.source[this.pos] === "$" && this.pos + 1 < this.source.length && this.source[this.pos + 1] === "{") {
          hasInterpolation = true;
        }
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
      if (this.pos >= this.source.length) {
        throw new GraftError("Unterminated string literal", loc);
      }
      this.pos++;
      this.column++;
      const type = hasInterpolation ? "TemplateString" /* TemplateString */ : "StringLiteral" /* StringLiteral */;
      this.tokens.push({ type, value, location: { ...loc, length: value.length + 2 } });
    }
    readNumber() {
      const loc = this.location();
      let value = "";
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
      if (this.pos < this.source.length && this.source[this.pos] === "k") {
        value += "k";
        this.pos++;
        this.column++;
        this.tokens.push({ type: "KIntegerLiteral" /* KIntegerLiteral */, value, location: { ...loc, length: value.length } });
        return;
      }
      if (this.pos < this.source.length && this.source[this.pos] === "." && this.peek(1) !== void 0 && this.isDigit(this.peek(1))) {
        value += ".";
        this.pos++;
        this.column++;
        while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
          value += this.source[this.pos];
          this.pos++;
          this.column++;
        }
        this.tokens.push({ type: "FloatLiteral" /* FloatLiteral */, value, location: { ...loc, length: value.length } });
        return;
      }
      this.tokens.push({ type: "IntegerLiteral" /* IntegerLiteral */, value, location: { ...loc, length: value.length } });
    }
    readIdentifierOrKeyword() {
      const loc = this.location();
      let value = "";
      while (this.pos < this.source.length && this.isAlphaNumeric(this.source[this.pos])) {
        value += this.source[this.pos];
        this.pos++;
        this.column++;
      }
      const keywordType = KEYWORDS[value];
      this.tokens.push({
        type: keywordType ?? "Identifier" /* Identifier */,
        value,
        location: { ...loc, length: value.length }
      });
    }
    readSymbol() {
      const loc = this.location();
      const ch = this.source[this.pos];
      const next = this.peek(1);
      const twoChar = this.matchTwoChar(ch, next);
      if (twoChar) {
        this.tokens.push({ type: twoChar[0], value: twoChar[1], location: { ...loc, length: 2 } });
        this.pos += 2;
        this.column += 2;
        return true;
      }
      const singleType = SINGLE_CHAR[ch];
      if (singleType !== void 0) {
        this.tokens.push({ type: singleType, value: ch, location: { ...loc, length: 1 } });
        this.pos++;
        this.column++;
        return true;
      }
      return false;
    }
    matchTwoChar(ch, next) {
      if (ch === "-" && next === ">") return ["Arrow" /* Arrow */, "->"];
      if (ch === "." && next === ".") return ["DotDot" /* DotDot */, ".."];
      if (ch === ">" && next === "=") return ["GreaterEqual" /* GreaterEqual */, ">="];
      if (ch === "<" && next === "=") return ["LessEqual" /* LessEqual */, "<="];
      if (ch === "=" && next === "=") return ["EqualEqual" /* EqualEqual */, "=="];
      if (ch === "!" && next === "=") return ["BangEqual" /* BangEqual */, "!="];
      if (ch === "&" && next === "&") return ["AmpAmp" /* AmpAmp */, "&&"];
      if (ch === "|" && next === "|") return ["PipePipe" /* PipePipe */, "||"];
      if (ch === "?" && next === "?") return ["QuestionQuestion" /* QuestionQuestion */, "??"];
      return null;
    }
    peek(offset) {
      return this.source[this.pos + offset];
    }
    location() {
      return { line: this.line, column: this.column, offset: this.pos };
    }
    isDigit(ch) {
      return ch >= "0" && ch <= "9";
    }
    isAlpha(ch) {
      return ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_";
    }
    isAlphaNumeric(ch) {
      return this.isAlpha(ch) || this.isDigit(ch);
    }
  };

  // src/parser/ast.ts
  var BUILTIN_FUNCTIONS = {
    len: { arity: 1, returnType: "number", signature: "len(value) -> number", description: "Returns the length of an array or string." },
    max: { arity: 2, returnType: "number", signature: "max(a, b) -> number", description: "Returns the larger of two numbers." },
    min: { arity: 2, returnType: "number", signature: "min(a, b) -> number", description: "Returns the smaller of two numbers." },
    str: { arity: 1, returnType: "string", signature: "str(value) -> string", description: "Converts a value to its string representation. Objects are JSON-stringified." },
    abs: { arity: 1, returnType: "number", signature: "abs(n) -> number", description: "Returns the absolute value of a number." },
    round: { arity: 1, returnType: "number", signature: "round(n) -> number", description: "Rounds a number to the nearest integer." },
    keys: { arity: 1, returnType: "unknown", signature: "keys(obj) -> array", description: "Returns the keys of an object as an array." }
  };

  // src/parser/parser.ts
  var KEYWORD_TYPES = new Set(Object.values(KEYWORDS));
  var Parser = class _Parser {
    constructor(tokens) {
      this.tokens = tokens;
    }
    pos = 0;
    errors = [];
    static MAX_ERRORS = 25;
    static DECLARATION_KEYWORDS = /* @__PURE__ */ new Set([
      "Context" /* Context */,
      "Node" /* Node */,
      "Memory" /* Memory */,
      "Graph" /* Graph */,
      "Edge" /* Edge */,
      "Import" /* Import */
    ]);
    parse() {
      const program = {
        imports: [],
        memories: [],
        contexts: [],
        nodes: [],
        edges: [],
        graphs: []
      };
      let seenNonImport = false;
      while (!this.isAtEnd()) {
        if (this.errors.length >= _Parser.MAX_ERRORS) break;
        const token = this.current();
        try {
          switch (token.type) {
            case "Import" /* Import */:
              if (seenNonImport) {
                this.errors.push(this.error("Import declarations must appear before all other declarations"));
                this.advance();
                this.synchronize();
                break;
              }
              program.imports.push(this.parseImportDecl());
              break;
            case "Memory" /* Memory */:
              seenNonImport = true;
              program.memories.push(this.parseMemoryDecl());
              break;
            case "Context" /* Context */:
              seenNonImport = true;
              program.contexts.push(this.parseContext());
              break;
            case "Node" /* Node */:
              seenNonImport = true;
              program.nodes.push(this.parseNode());
              break;
            case "Edge" /* Edge */:
              seenNonImport = true;
              program.edges.push(this.parseEdge());
              break;
            case "Graph" /* Graph */:
              seenNonImport = true;
              program.graphs.push(this.parseGraph());
              break;
            default: {
              this.errors.push(this.error(
                `Unexpected token '${token.value}', expected 'import', 'memory', 'context', 'node', 'edge', or 'graph'`
              ));
              const posBefore = this.pos;
              this.synchronize();
              if (this.pos === posBefore && !this.isAtEnd()) this.advance();
              break;
            }
          }
        } catch (e) {
          if (e instanceof GraftError) {
            this.errors.push(e);
            const posBefore = this.pos;
            this.synchronize();
            if (this.pos === posBefore && !this.isAtEnd()) this.advance();
          } else {
            throw e;
          }
        }
      }
      return { program, errors: this.errors };
    }
    synchronize() {
      let braceDepth = 0;
      while (!this.isAtEnd()) {
        const token = this.current();
        if (token.type === "LBrace" /* LBrace */) {
          braceDepth++;
        } else if (token.type === "RBrace" /* RBrace */) {
          if (braceDepth > 0) {
            braceDepth--;
          } else {
            this.advance();
            break;
          }
        } else if (braceDepth === 0 && _Parser.DECLARATION_KEYWORDS.has(token.type)) {
          break;
        }
        this.advance();
      }
    }
    // --- Import ------------------------------------------------
    parseImportDecl() {
      const loc = this.current().location;
      this.expect("Import" /* Import */);
      this.expect("LBrace" /* LBrace */);
      const names = [];
      while (!this.check("RBrace" /* RBrace */)) {
        if (names.length > 0) this.expect("Comma" /* Comma */);
        names.push(this.expectIdentifier());
      }
      if (names.length === 0) {
        throw this.error("Import must specify at least one name");
      }
      this.expect("RBrace" /* RBrace */);
      this.expect("From" /* From */);
      const pathToken = this.expect("StringLiteral" /* StringLiteral */);
      const path = pathToken.value;
      if (path === "") {
        throw this.error("Import path cannot be empty");
      }
      return { names, path, location: loc };
    }
    // --- Memory ------------------------------------------------
    parseMemoryDecl() {
      const loc = this.current().location;
      this.expect("Memory" /* Memory */);
      const name = this.expectIdentifier();
      this.expect("LParen" /* LParen */);
      this.expect("MaxTokens" /* MaxTokens */);
      this.expect("Colon" /* Colon */);
      const maxTokens = this.parseTokenValue();
      let storage = "file";
      if (this.check("Comma" /* Comma */)) {
        this.advance();
        this.expect("Storage" /* Storage */);
        this.expect("Colon" /* Colon */);
        const storageValue = this.expectIdentifierOrKeyword();
        if (storageValue !== "file") {
          throw this.error(`Unknown storage type '${storageValue}', expected 'file'`);
        }
        storage = "file";
      }
      this.expect("RParen" /* RParen */);
      this.expect("LBrace" /* LBrace */);
      const fields = this.parseFields();
      this.expect("RBrace" /* RBrace */);
      return { name, maxTokens, storage, fields, location: loc };
    }
    // --- Context ------------------------------------------------
    parseContext() {
      const loc = this.current().location;
      this.expect("Context" /* Context */);
      const name = this.expectIdentifier();
      this.expect("LParen" /* LParen */);
      this.expect("MaxTokens" /* MaxTokens */);
      this.expect("Colon" /* Colon */);
      const maxTokens = this.parseTokenValue();
      this.expect("RParen" /* RParen */);
      this.expect("LBrace" /* LBrace */);
      const fields = this.parseFields();
      this.expect("RBrace" /* RBrace */);
      return { name, maxTokens, fields, location: loc };
    }
    // --- Node ---------------------------------------------------
    parseNode() {
      const loc = this.current().location;
      this.expect("Node" /* Node */);
      const name = this.expectIdentifier();
      this.expect("LParen" /* LParen */);
      this.expect("Model" /* Model */);
      this.expect("Colon" /* Colon */);
      const model = this.expectIdentifier();
      this.expect("Comma" /* Comma */);
      this.expect("Budget" /* Budget */);
      this.expect("Colon" /* Colon */);
      const budgetIn = this.parseTokenValue();
      this.expect("Slash" /* Slash */);
      const budgetOut = this.parseTokenValue();
      this.expect("RParen" /* RParen */);
      this.expect("LBrace" /* LBrace */);
      let reads = [];
      let tools = [];
      let writes = [];
      let onFailure;
      let produces;
      let hasWrites = false;
      while (!this.check("RBrace" /* RBrace */)) {
        if (this.check("Reads" /* Reads */)) {
          this.advance();
          this.expect("Colon" /* Colon */);
          reads = this.parseContextRefList();
        } else if (this.check("Tools" /* Tools */)) {
          this.advance();
          this.expect("Colon" /* Colon */);
          tools = this.parseIdentifierList();
        } else if (this.check("Writes" /* Writes */)) {
          if (hasWrites) {
            throw this.error("Duplicate writes clause in node");
          }
          hasWrites = true;
          this.advance();
          this.expect("Colon" /* Colon */);
          writes = this.parseWriteRefList();
        } else if (this.check("OnFailure" /* OnFailure */)) {
          this.advance();
          this.expect("Colon" /* Colon */);
          onFailure = this.parseFailureStrategy();
        } else if (this.check("Produces" /* Produces */)) {
          produces = this.parseProduces();
        } else {
          throw this.error(`Unexpected token '${this.current().value}' in node body`);
        }
      }
      this.expect("RBrace" /* RBrace */);
      if (!produces) {
        throw new GraftError("Node must have a produces declaration", loc, "error", "PARSE_MISSING_FIELD");
      }
      return { name, model, budgetIn, budgetOut, reads, tools, writes, onFailure, produces, location: loc };
    }
    parseProduces() {
      const loc = this.current().location;
      this.expect("Produces" /* Produces */);
      const name = this.expectIdentifier();
      this.expect("LBrace" /* LBrace */);
      const fields = this.parseFields();
      this.expect("RBrace" /* RBrace */);
      return { name, fields, location: loc };
    }
    parseContextRefList() {
      this.expect("LBracket" /* LBracket */);
      const refs = [];
      while (!this.check("RBracket" /* RBracket */)) {
        if (refs.length > 0) this.expect("Comma" /* Comma */);
        const loc = this.current().location;
        const context = this.expectIdentifier();
        let field;
        if (this.check("Dot" /* Dot */)) {
          this.advance();
          if (this.check("LBrace" /* LBrace */)) {
            this.advance();
            const fields = [];
            while (!this.check("RBrace" /* RBrace */)) {
              if (fields.length > 0) this.expect("Comma" /* Comma */);
              fields.push(this.expectIdentifierOrKeyword());
            }
            if (fields.length === 0) {
              throw this.error("Multi-field read must specify at least one field");
            }
            this.expect("RBrace" /* RBrace */);
            field = fields;
          } else {
            field = [this.expectIdentifierOrKeyword()];
          }
        }
        refs.push({ context, field, location: loc });
      }
      this.expect("RBracket" /* RBracket */);
      return refs;
    }
    parseWriteRefList() {
      this.expect("LBracket" /* LBracket */);
      const refs = [];
      while (!this.check("RBracket" /* RBracket */)) {
        if (refs.length > 0) this.expect("Comma" /* Comma */);
        const loc = this.current().location;
        const memory = this.expectIdentifier();
        let field;
        if (this.check("Dot" /* Dot */)) {
          this.advance();
          field = this.expectIdentifierOrKeyword();
        }
        refs.push({ memory, field, location: loc });
      }
      this.expect("RBracket" /* RBracket */);
      return refs;
    }
    parseIdentifierList() {
      this.expect("LBracket" /* LBracket */);
      const ids = [];
      while (!this.check("RBracket" /* RBracket */)) {
        if (ids.length > 0) this.expect("Comma" /* Comma */);
        ids.push(this.expectIdentifierOrKeyword());
      }
      this.expect("RBracket" /* RBracket */);
      return ids;
    }
    parseFailureStrategy() {
      if (this.check("Retry" /* Retry */)) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const max = this.parseIntValue();
        if (this.check("Comma" /* Comma */)) {
          this.advance();
          this.expect("Fallback" /* Fallback */);
          this.expect("LParen" /* LParen */);
          const node = this.expectIdentifier();
          this.expect("RParen" /* RParen */);
          this.expect("RParen" /* RParen */);
          return { type: "retry_then_fallback", max, node };
        }
        this.expect("RParen" /* RParen */);
        return { type: "retry", max };
      }
      if (this.check("Fallback" /* Fallback */)) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const node = this.expectIdentifier();
        this.expect("RParen" /* RParen */);
        return { type: "fallback", node };
      }
      if (this.check("Skip" /* Skip */)) {
        this.advance();
        return { type: "skip" };
      }
      if (this.check("Abort" /* Abort */)) {
        this.advance();
        return { type: "abort" };
      }
      throw this.error("Expected failure strategy (retry, fallback, skip, abort)");
    }
    // --- Edge ---------------------------------------------------
    parseEdge() {
      const loc = this.current().location;
      this.expect("Edge" /* Edge */);
      const source = this.expectIdentifier();
      this.expect("Arrow" /* Arrow */);
      let target;
      let transforms = [];
      if (this.check("LBrace" /* LBrace */)) {
        target = this.parseConditionalTarget();
      } else {
        const node = this.expectIdentifier();
        target = { kind: "direct", node };
        while (this.check("Pipe" /* Pipe */)) {
          this.advance();
          transforms.push(this.parseTransform());
        }
      }
      return { source, target, transforms, location: loc };
    }
    parseConditionalTarget() {
      this.expect("LBrace" /* LBrace */);
      const branches = [];
      while (!this.check("RBrace" /* RBrace */)) {
        if (this.check("When" /* When */)) {
          this.advance();
          const condition = this.parseCondition();
          this.expect("Arrow" /* Arrow */);
          const target = this.check("Done" /* Done */) ? (this.advance(), "done") : this.expectIdentifier();
          branches.push({ condition, target });
        } else if (this.check("Else" /* Else */)) {
          this.advance();
          this.expect("Arrow" /* Arrow */);
          const target = this.check("Done" /* Done */) ? (this.advance(), "done") : this.expectIdentifier();
          branches.push({ condition: void 0, target });
        } else {
          throw this.error(`Expected 'when' or 'else' in conditional edge`);
        }
      }
      this.expect("RBrace" /* RBrace */);
      return { kind: "conditional", branches };
    }
    parseTransform() {
      if (this.check("Select" /* Select */)) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const fields = [];
        fields.push(this.expectIdentifierOrKeyword());
        while (this.check("Comma" /* Comma */)) {
          this.advance();
          fields.push(this.expectIdentifierOrKeyword());
        }
        this.expect("RParen" /* RParen */);
        return { type: "select", fields };
      }
      if (this.check("Filter" /* Filter */)) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const field = this.expectIdentifierOrKeyword();
        this.expect("Comma" /* Comma */);
        const condition = this.parseCondition();
        this.expect("RParen" /* RParen */);
        return { type: "filter", field, condition };
      }
      if (this.check("Drop" /* Drop */)) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const field = this.expectIdentifierOrKeyword();
        this.expect("RParen" /* RParen */);
        return { type: "drop", field };
      }
      if (this.check("Compact" /* Compact */)) {
        this.advance();
        return { type: "compact" };
      }
      if (this.check("Truncate" /* Truncate */)) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const tokens = this.parseTokenValue();
        this.expect("RParen" /* RParen */);
        return { type: "truncate", tokens };
      }
      throw this.error("Expected transform operation (select, filter, drop, compact, truncate)");
    }
    parseCondition() {
      const loc = this.current().location;
      const field = this.expectIdentifierOrKeyword();
      const left = { kind: "field_access", segments: [field], location: loc };
      const opToken = this.current();
      let op;
      switch (opToken.type) {
        case "GreaterEqual" /* GreaterEqual */:
          op = ">=";
          break;
        case "Greater" /* Greater */:
          op = ">";
          break;
        case "LessEqual" /* LessEqual */:
          op = "<=";
          break;
        case "Less" /* Less */:
          op = "<";
          break;
        case "EqualEqual" /* EqualEqual */:
          op = "==";
          break;
        case "BangEqual" /* BangEqual */:
          op = "!=";
          break;
        default:
          throw this.error(`Expected comparison operator, got '${opToken.value}'`);
      }
      this.advance();
      const value = this.parseConditionValue();
      const right = { kind: "literal", value, location: this.tokens[this.pos - 1].location };
      return { kind: "binary", op, left, right, location: loc };
    }
    parseConditionValue() {
      const token = this.current();
      if (token.type === "IntegerLiteral" /* IntegerLiteral */) {
        this.advance();
        return parseInt(token.value, 10);
      }
      if (token.type === "KIntegerLiteral" /* KIntegerLiteral */) {
        this.advance();
        return parseInt(token.value, 10) * 1e3;
      }
      if (token.type === "FloatLiteral" /* FloatLiteral */) {
        this.advance();
        return parseFloat(token.value);
      }
      if (token.type === "StringLiteral" /* StringLiteral */) {
        this.advance();
        return token.value;
      }
      if (token.type === "True" /* True */) {
        this.advance();
        return true;
      }
      if (token.type === "False" /* False */) {
        this.advance();
        return false;
      }
      if (token.type === "Identifier" /* Identifier */ || KEYWORD_TYPES.has(token.type)) {
        this.advance();
        return token.value;
      }
      throw this.error(`Expected value in condition, got '${token.value}'`);
    }
    // --- Graph --------------------------------------------------
    parseGraph() {
      const loc = this.current().location;
      this.expect("Graph" /* Graph */);
      const name = this.expectIdentifier();
      this.expect("LParen" /* LParen */);
      this.expect("Input" /* Input */);
      this.expect("Colon" /* Colon */);
      const input = this.expectIdentifier();
      this.expect("Comma" /* Comma */);
      this.expect("Output" /* Output */);
      this.expect("Colon" /* Colon */);
      const output = this.expectIdentifier();
      this.expect("Comma" /* Comma */);
      this.expect("Budget" /* Budget */);
      this.expect("Colon" /* Colon */);
      const budget = this.parseTokenValue();
      const params = [];
      while (this.check("Comma" /* Comma */)) {
        this.advance();
        if (this.check("RParen" /* RParen */)) break;
        params.push(this.parseGraphParam());
      }
      this.expect("RParen" /* RParen */);
      this.expect("LBrace" /* LBrace */);
      const flow = this.parseFlowNodes(
        /* insideBlock */
        false
      );
      this.expect("RBrace" /* RBrace */);
      return { name, input, output, budget, params, flow, location: loc };
    }
    parseGraphParam() {
      const loc = this.current().location;
      const name = this.expectIdentifierOrKeyword();
      this.expect("Colon" /* Colon */);
      const typeToken = this.current();
      let type;
      if (typeToken.type === "Identifier" /* Identifier */ && typeToken.value === "Node") {
        type = "Node";
        this.advance();
      } else if (typeToken.type === "Int" /* Int */) {
        type = "Int";
        this.advance();
      } else if (typeToken.type === "String" /* String */) {
        type = "String";
        this.advance();
      } else if (typeToken.type === "Bool" /* Bool */) {
        type = "Bool";
        this.advance();
      } else {
        throw this.error(`Expected param type (Node, Int, String, Bool), got '${typeToken.value}'`);
      }
      let defaultVal;
      if (this.check("Equals" /* Equals */)) {
        this.advance();
        defaultVal = this.parseConditionValue();
      }
      return { name, type, default: defaultVal, location: loc };
    }
    /**
     * Parse a sequence of flow nodes separated by arrows.
     * When insideBlock=true, stops when no more arrows (next token should be RBrace).
     * When insideBlock=false, expects -> done to terminate.
     */
    parseFlowNodes(insideBlock) {
      const steps = [];
      steps.push(this.parseFlowNode());
      while (this.check("Arrow" /* Arrow */)) {
        this.advance();
        if (this.check("Done" /* Done */)) {
          this.advance();
          if (insideBlock) {
            throw this.error("'done' is not allowed inside a foreach or parallel block");
          }
          return steps;
        }
        if (this.check("RBrace" /* RBrace */)) {
          throw this.error("Expected flow step after '->'");
        }
        steps.push(this.parseFlowNode());
      }
      if (!insideBlock) {
        throw this.error("Expected '-> done' to terminate graph flow");
      }
      return steps;
    }
    /**
     * Parse a single flow node: identifier, parallel block, foreach block,
     * let binding, or graph call.
     */
    parseFlowNode() {
      if (this.check("Parallel" /* Parallel */)) {
        return this.parseParallelStep();
      }
      if (this.check("Foreach" /* Foreach */)) {
        return this.parseForeachStep();
      }
      if (this.check("Let" /* Let */)) {
        return this.parseLetStep();
      }
      const loc = this.current().location;
      const name = this.expectIdentifier();
      if (this.check("LParen" /* LParen */)) {
        return this.parseGraphCall(name, loc);
      }
      return { kind: "node", name, location: loc };
    }
    parseLetStep() {
      const loc = this.current().location;
      this.expect("Let" /* Let */);
      const name = this.expectIdentifierOrKeyword();
      this.expect("Equals" /* Equals */);
      const value = this.parseExpr();
      return { kind: "let", name, value, location: loc };
    }
    parseGraphCall(name, location) {
      this.expect("LParen" /* LParen */);
      const args = [];
      while (!this.check("RParen" /* RParen */)) {
        if (args.length > 0) this.expect("Comma" /* Comma */);
        const argLoc = this.current().location;
        const argName = this.expectIdentifierOrKeyword();
        this.expect("Colon" /* Colon */);
        const value = this.parseExpr();
        args.push({ name: argName, value, location: argLoc });
      }
      this.expect("RParen" /* RParen */);
      return { kind: "graph_call", name, args, location };
    }
    /**
     * parallel { SecurityReviewer  PerformanceReviewer  StyleReviewer }
     *
     * Branches are whitespace-separated identifiers (no commas required).
     * Optional commas are accepted for user convenience.
     */
    parseParallelStep() {
      const loc = this.current().location;
      this.expect("Parallel" /* Parallel */);
      this.expect("LBrace" /* LBrace */);
      const branches = [];
      while (!this.check("RBrace" /* RBrace */)) {
        if (branches.length > 0 && this.check("Comma" /* Comma */)) {
          this.advance();
        }
        branches.push(this.expectIdentifier());
      }
      this.expect("RBrace" /* RBrace */);
      if (branches.length < 2) {
        throw this.error("parallel block must contain at least 2 branches");
      }
      return { kind: "parallel", branches, location: loc };
    }
    /**
     * foreach(Planner.output.steps as step, max_iterations: 5) {
     *   Implementer -> Verifier
     * }
     */
    parseForeachStep() {
      const loc = this.current().location;
      this.expect("Foreach" /* Foreach */);
      this.expect("LParen" /* LParen */);
      const source = this.expectIdentifier();
      this.expect("Dot" /* Dot */);
      this.expect("Output" /* Output */);
      this.expect("Dot" /* Dot */);
      const field = this.expectIdentifierOrKeyword();
      this.expect("As" /* As */);
      const binding = this.expectIdentifierOrKeyword();
      this.expect("Comma" /* Comma */);
      this.expect("MaxIterations" /* MaxIterations */);
      this.expect("Colon" /* Colon */);
      const maxIterations = this.parseIntValue();
      if (maxIterations < 1) {
        throw this.error("max_iterations must be at least 1");
      }
      this.expect("RParen" /* RParen */);
      this.expect("LBrace" /* LBrace */);
      const body = this.parseFlowNodes(
        /* insideBlock */
        true
      );
      this.expect("RBrace" /* RBrace */);
      if (body.length === 0) {
        throw this.error("foreach body must contain at least one step");
      }
      for (const step of body) {
        if (step.kind === "parallel" || step.kind === "foreach") {
          throw this.error("Nested parallel or foreach inside foreach is not supported");
        }
      }
      return { kind: "foreach", source, field, binding, maxIterations, body, location: loc };
    }
    // --- Expressions --------------------------------------------
    parseExpr() {
      return this.parseNullCoalesce();
    }
    parseNullCoalesce() {
      let left = this.parseLogicalOr();
      while (this.check("QuestionQuestion" /* QuestionQuestion */)) {
        this.advance();
        const right = this.parseLogicalOr();
        left = { kind: "binary", op: "??", left, right, location: left.location };
      }
      return left;
    }
    parseLogicalOr() {
      let left = this.parseLogicalAnd();
      while (this.check("PipePipe" /* PipePipe */)) {
        this.advance();
        const right = this.parseLogicalAnd();
        left = { kind: "binary", op: "||", left, right, location: left.location };
      }
      return left;
    }
    parseLogicalAnd() {
      let left = this.parseComparison();
      while (this.check("AmpAmp" /* AmpAmp */)) {
        this.advance();
        const right = this.parseComparison();
        left = { kind: "binary", op: "&&", left, right, location: left.location };
      }
      return left;
    }
    parseComparison() {
      let left = this.parseAdditive();
      while (this.check("Greater" /* Greater */) || this.check("Less" /* Less */) || this.check("GreaterEqual" /* GreaterEqual */) || this.check("LessEqual" /* LessEqual */) || this.check("EqualEqual" /* EqualEqual */) || this.check("BangEqual" /* BangEqual */)) {
        const opToken = this.current();
        let op;
        switch (opToken.type) {
          case "Greater" /* Greater */:
            op = ">";
            break;
          case "Less" /* Less */:
            op = "<";
            break;
          case "GreaterEqual" /* GreaterEqual */:
            op = ">=";
            break;
          case "LessEqual" /* LessEqual */:
            op = "<=";
            break;
          case "EqualEqual" /* EqualEqual */:
            op = "==";
            break;
          case "BangEqual" /* BangEqual */:
            op = "!=";
            break;
          default:
            throw this.error(`Unexpected operator '${opToken.value}'`);
        }
        this.advance();
        const right = this.parseAdditive();
        left = { kind: "binary", op, left, right, location: left.location };
      }
      return left;
    }
    parseAdditive() {
      let left = this.parseMultiplicative();
      while (this.check("Plus" /* Plus */) || this.check("Minus" /* Minus */)) {
        const opToken = this.current();
        const op = opToken.type === "Plus" /* Plus */ ? "+" : "-";
        this.advance();
        const right = this.parseMultiplicative();
        left = { kind: "binary", op, left, right, location: left.location };
      }
      return left;
    }
    parseMultiplicative() {
      let left = this.parseUnary();
      while (this.check("Star" /* Star */) || this.check("Percent" /* Percent */) || this.check("Slash" /* Slash */)) {
        const opToken = this.current();
        let op;
        switch (opToken.type) {
          case "Star" /* Star */:
            op = "*";
            break;
          case "Percent" /* Percent */:
            op = "%";
            break;
          case "Slash" /* Slash */:
            op = "/";
            break;
          default:
            throw this.error(`Unexpected operator '${opToken.value}'`);
        }
        this.advance();
        const right = this.parseUnary();
        left = { kind: "binary", op, left, right, location: left.location };
      }
      return left;
    }
    parseUnary() {
      if (this.check("Minus" /* Minus */)) {
        const loc = this.current().location;
        this.advance();
        const operand = this.parseUnary();
        return { kind: "unary", op: "-", operand, location: loc };
      }
      if (this.check("Bang" /* Bang */)) {
        const loc = this.current().location;
        this.advance();
        const operand = this.parseUnary();
        return { kind: "unary", op: "!", operand, location: loc };
      }
      return this.parsePrimary();
    }
    parseTemplateParts(raw, loc) {
      const parts = [];
      let i = 0;
      while (i < raw.length) {
        const dollarIdx = raw.indexOf("${", i);
        if (dollarIdx === -1) {
          if (i < raw.length) {
            parts.push({ kind: "text", value: raw.slice(i) });
          }
          break;
        }
        if (dollarIdx > i) {
          parts.push({ kind: "text", value: raw.slice(i, dollarIdx) });
        }
        let depth = 1;
        let j = dollarIdx + 2;
        while (j < raw.length && depth > 0) {
          if (raw[j] === "{") depth++;
          else if (raw[j] === "}") depth--;
          if (depth > 0) j++;
        }
        if (depth !== 0) {
          throw new GraftError("Unterminated template interpolation", loc);
        }
        const exprSource = raw.slice(dollarIdx + 2, j);
        const innerLexer = new Lexer(exprSource);
        const innerTokens = innerLexer.tokenize();
        const exprTokens = innerTokens.filter((t) => t.type !== "EOF" /* EOF */);
        exprTokens.push({ type: "EOF" /* EOF */, value: "", location: loc });
        const innerParser = new _Parser(exprTokens);
        const expr = innerParser.parseExpr();
        parts.push({ kind: "expr", value: expr });
        i = j + 1;
      }
      return parts;
    }
    parsePrimary() {
      const token = this.current();
      const loc = token.location;
      if (token.type === "IntegerLiteral" /* IntegerLiteral */) {
        this.advance();
        return { kind: "literal", value: parseInt(token.value, 10), location: loc };
      }
      if (token.type === "KIntegerLiteral" /* KIntegerLiteral */) {
        this.advance();
        return { kind: "literal", value: parseInt(token.value, 10) * 1e3, location: loc };
      }
      if (token.type === "FloatLiteral" /* FloatLiteral */) {
        this.advance();
        return { kind: "literal", value: parseFloat(token.value), location: loc };
      }
      if (token.type === "StringLiteral" /* StringLiteral */) {
        this.advance();
        return { kind: "literal", value: token.value, location: loc };
      }
      if (token.type === "TemplateString" /* TemplateString */) {
        this.advance();
        const parts = this.parseTemplateParts(token.value, loc);
        return { kind: "template", parts, location: loc };
      }
      if (token.type === "True" /* True */) {
        this.advance();
        return { kind: "literal", value: true, location: loc };
      }
      if (token.type === "False" /* False */) {
        this.advance();
        return { kind: "literal", value: false, location: loc };
      }
      if (token.type === "LParen" /* LParen */) {
        this.advance();
        const inner = this.parseExpr();
        this.expect("RParen" /* RParen */);
        return { kind: "group", inner, location: loc };
      }
      if (token.type === "Identifier" /* Identifier */ && token.value in BUILTIN_FUNCTIONS && this.peekType(1) === "LParen" /* LParen */) {
        const name = token.value;
        this.advance();
        this.advance();
        const args = [];
        if (!this.check("RParen" /* RParen */)) {
          args.push(this.parseExpr());
          while (this.check("Comma" /* Comma */)) {
            this.advance();
            args.push(this.parseExpr());
          }
        }
        this.expect("RParen" /* RParen */);
        return { kind: "call", name, args, location: loc };
      }
      if (token.type === "If" /* If */) {
        this.advance();
        const condition = this.parseExpr();
        this.expect("Then" /* Then */);
        const consequent = this.parseExpr();
        this.expect("Else" /* Else */);
        const alternate = this.parseExpr();
        return { kind: "conditional", condition, consequent, alternate, location: loc };
      }
      if (token.type === "Identifier" /* Identifier */ || KEYWORD_TYPES.has(token.type)) {
        this.advance();
        const segments = [token.value];
        while (this.check("Dot" /* Dot */)) {
          this.advance();
          const seg = this.expectIdentifierOrKeyword();
          segments.push(seg);
        }
        return { kind: "field_access", segments, location: loc };
      }
      throw this.error(`Expected expression, got '${token.value}' (${token.type})`);
    }
    // --- Types --------------------------------------------------
    parseType() {
      const token = this.current();
      if (token.type === "List" /* List */) {
        this.advance();
        this.expect("Less" /* Less */);
        const element = this.parseTypeOrInlineStruct();
        this.expect("Greater" /* Greater */);
        return { kind: "list", element };
      }
      if (token.type === "Map" /* Map */) {
        this.advance();
        this.expect("Less" /* Less */);
        const key = this.parseType();
        this.expect("Comma" /* Comma */);
        const value = this.parseType();
        this.expect("Greater" /* Greater */);
        return { kind: "map", key, value };
      }
      if (token.type === "Optional" /* Optional */) {
        this.advance();
        this.expect("Less" /* Less */);
        const inner = this.parseTypeOrInlineStruct();
        this.expect("Greater" /* Greater */);
        return { kind: "optional", inner };
      }
      if (token.type === "TokenBounded" /* TokenBounded */) {
        this.advance();
        this.expect("Less" /* Less */);
        const inner = this.parseType();
        this.expect("Comma" /* Comma */);
        const max = this.parseIntValue();
        this.expect("Greater" /* Greater */);
        return { kind: "token_bounded", inner, max };
      }
      if (token.type === "Float" /* Float */) {
        this.advance();
        if (this.check("LParen" /* LParen */)) {
          this.advance();
          const min = this.parseNumericValue();
          this.expect("DotDot" /* DotDot */);
          const max = this.parseNumericValue();
          this.expect("RParen" /* RParen */);
          return { kind: "primitive_range", name: "Float", min, max };
        }
        return { kind: "primitive", name: "Float" };
      }
      if (token.type === "Enum" /* Enum */) {
        this.advance();
        this.expect("LParen" /* LParen */);
        const values = [];
        values.push(this.expectIdentifierOrKeyword());
        while (this.check("Comma" /* Comma */)) {
          this.advance();
          values.push(this.expectIdentifierOrKeyword());
        }
        this.expect("RParen" /* RParen */);
        return { kind: "enum", values };
      }
      if (token.type === "String" /* String */) {
        this.advance();
        return { kind: "primitive", name: "String" };
      }
      if (token.type === "Int" /* Int */) {
        this.advance();
        return { kind: "primitive", name: "Int" };
      }
      if (token.type === "Bool" /* Bool */) {
        this.advance();
        return { kind: "primitive", name: "Bool" };
      }
      if (token.type === "FilePath" /* FilePath */) {
        this.advance();
        return { kind: "domain", name: "FilePath" };
      }
      if (token.type === "FileDiff" /* FileDiff */) {
        this.advance();
        return { kind: "domain", name: "FileDiff" };
      }
      if (token.type === "TestFile" /* TestFile */) {
        this.advance();
        return { kind: "domain", name: "TestFile" };
      }
      if (token.type === "IssueRef" /* IssueRef */) {
        this.advance();
        return { kind: "domain", name: "IssueRef" };
      }
      throw this.error(`Expected type, got '${token.value}'`);
    }
    // Parses a type that could be an inline struct: Name { fields }
    parseTypeOrInlineStruct() {
      if (this.current().type === "Identifier" /* Identifier */ && this.peekType(1) === "LBrace" /* LBrace */) {
        const name = this.expectIdentifier();
        this.expect("LBrace" /* LBrace */);
        const fields = this.parseFields();
        this.expect("RBrace" /* RBrace */);
        return { kind: "struct", name, fields };
      }
      return this.parseType();
    }
    // --- Fields -------------------------------------------------
    parseFields() {
      const fields = [];
      while (!this.check("RBrace" /* RBrace */)) {
        const loc = this.current().location;
        const name = this.expectIdentifierOrKeyword();
        this.expect("Colon" /* Colon */);
        const type = this.parseTypeOrInlineStruct();
        fields.push({ name, type, location: loc });
      }
      return fields;
    }
    // --- Helpers ------------------------------------------------
    parseTokenValue() {
      const token = this.current();
      if (token.type === "IntegerLiteral" /* IntegerLiteral */) {
        this.advance();
        return parseInt(token.value, 10);
      }
      if (token.type === "KIntegerLiteral" /* KIntegerLiteral */) {
        this.advance();
        return parseInt(token.value, 10) * 1e3;
      }
      throw this.error(`Expected integer or k-integer, got '${token.value}'`);
    }
    parseIntValue() {
      const token = this.current();
      if (token.type === "IntegerLiteral" /* IntegerLiteral */) {
        this.advance();
        return parseInt(token.value, 10);
      }
      throw this.error(`Expected integer, got '${token.value}'`);
    }
    parseNumericValue() {
      const token = this.current();
      if (token.type === "IntegerLiteral" /* IntegerLiteral */) {
        this.advance();
        return parseInt(token.value, 10);
      }
      if (token.type === "FloatLiteral" /* FloatLiteral */) {
        this.advance();
        return parseFloat(token.value);
      }
      throw this.error(`Expected number, got '${token.value}'`);
    }
    /**
     * Strict identifier: only accepts TokenType.Identifier.
     * Used for declaration names (context, node, edge, graph), produces names,
     * context ref context-part, graph flow nodes, edge source/target.
     * These are PascalCase by convention and must not collide with keywords.
     */
    expectIdentifier() {
      const token = this.current();
      if (token.type === "Identifier" /* Identifier */) {
        this.advance();
        return token.value;
      }
      throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
    }
    /**
     * Permissive identifier: accepts TokenType.Identifier OR any keyword token.
     * Used for field names, tool names, enum values, transform field arguments,
     * condition field names -- positions where a keyword-like word is valid as a name.
     */
    expectIdentifierOrKeyword() {
      const token = this.current();
      if (token.type === "Identifier" /* Identifier */ || KEYWORD_TYPES.has(token.type)) {
        this.advance();
        return token.value;
      }
      throw this.error(`Expected identifier, got '${token.value}' (${token.type})`);
    }
    expect(type) {
      const token = this.current();
      if (token.type !== type) {
        throw this.error(`Expected '${type}', got '${token.value}' (${token.type})`, "PARSE_UNEXPECTED_TOKEN");
      }
      this.advance();
      return token;
    }
    check(type) {
      return this.current().type === type;
    }
    current() {
      return this.tokens[this.pos];
    }
    advance() {
      const token = this.tokens[this.pos];
      if (!this.isAtEnd()) this.pos++;
      return token;
    }
    peekType(offset) {
      const idx = this.pos + offset;
      if (idx < this.tokens.length) return this.tokens[idx].type;
      return void 0;
    }
    isAtEnd() {
      return this.current().type === "EOF" /* EOF */;
    }
    error(message, code = "PARSE_UNEXPECTED_TOKEN") {
      return new GraftError(message, this.current().location, "error", code);
    }
  };

  // src/program-index.ts
  var ProgramIndex = class {
    contextMap;
    nodeMap;
    memoryMap;
    edgesBySource;
    producesNodeMap;
    graphMap;
    producesFieldsMap;
    memoryFieldsMap;
    letBindingMap;
    constructor(program) {
      this.contextMap = /* @__PURE__ */ new Map();
      for (const c of program.contexts) {
        this.contextMap.set(c.name, c);
      }
      this.nodeMap = /* @__PURE__ */ new Map();
      this.producesNodeMap = /* @__PURE__ */ new Map();
      for (const n of program.nodes) {
        this.nodeMap.set(n.name, n);
        this.producesNodeMap.set(n.produces.name, n);
      }
      this.memoryMap = /* @__PURE__ */ new Map();
      for (const m of program.memories) {
        this.memoryMap.set(m.name, m);
      }
      this.edgesBySource = /* @__PURE__ */ new Map();
      for (const e of program.edges) {
        const existing = this.edgesBySource.get(e.source) ?? [];
        existing.push(e);
        this.edgesBySource.set(e.source, existing);
      }
      this.graphMap = /* @__PURE__ */ new Map();
      for (const g of program.graphs) {
        this.graphMap.set(g.name, g);
      }
      this.producesFieldsMap = /* @__PURE__ */ new Map();
      for (const n of program.nodes) {
        const fields = /* @__PURE__ */ new Map();
        for (const f of n.produces.fields) {
          fields.set(f.name, f.type);
        }
        this.producesFieldsMap.set(n.name, fields);
        this.producesFieldsMap.set(n.produces.name, fields);
      }
      this.memoryFieldsMap = /* @__PURE__ */ new Map();
      for (const m of program.memories) {
        const fields = /* @__PURE__ */ new Map();
        for (const f of m.fields) {
          fields.set(f.name, f.type);
        }
        this.memoryFieldsMap.set(m.name, fields);
      }
      this.letBindingMap = /* @__PURE__ */ new Map();
      for (const g of program.graphs) {
        this.collectLetBindings(g.flow, g.name);
      }
    }
    collectLetBindings(nodes, graphName) {
      for (const step of nodes) {
        if (step.kind === "let") {
          this.letBindingMap.set(step.name, {
            name: step.name,
            value: step.value,
            graphName,
            location: step.location
          });
        } else if (step.kind === "foreach") {
          this.collectLetBindings(step.body, graphName);
        }
      }
    }
  };

  // src/analyzer/graph-checker.ts
  function checkVarCollision(name, graphName, location, index, errors) {
    if (index.nodeMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared node '${name}'`,
        location,
        "error",
        "SCOPE_VAR_COLLISION"
      ));
    } else if (index.contextMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared context '${name}'`,
        location,
        "error",
        "SCOPE_VAR_COLLISION"
      ));
    } else if (index.memoryMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared memory '${name}'`,
        location,
        "error",
        "SCOPE_VAR_COLLISION"
      ));
    } else if (index.graphMap.has(name)) {
      errors.push(new GraftError(
        `Variable '${name}' in graph '${graphName}' collides with declared graph '${name}'`,
        location,
        "error",
        "SCOPE_VAR_COLLISION"
      ));
    }
  }
  function checkExprSources(expr, seenNodes, declaredVars, graphName, errors) {
    switch (expr.kind) {
      case "literal":
        break;
      case "field_access": {
        const first = expr.segments[0];
        if (expr.segments.length === 1) {
          if (!declaredVars.has(first) && !seenNodes.has(first)) {
            errors.push(new GraftError(
              `Variable or node '${first}' referenced before declaration in graph '${graphName}'`,
              expr.location,
              "error",
              "SCOPE_VAR_ORDER"
            ));
          }
        } else {
          if (!seenNodes.has(first) && !declaredVars.has(first)) {
            errors.push(new GraftError(
              `Node '${first}' referenced before appearance in graph '${graphName}' flow`,
              expr.location,
              "error",
              "SCOPE_VAR_ORDER"
            ));
          }
        }
        break;
      }
      case "binary":
        checkExprSources(expr.left, seenNodes, declaredVars, graphName, errors);
        checkExprSources(expr.right, seenNodes, declaredVars, graphName, errors);
        break;
      case "unary":
        checkExprSources(expr.operand, seenNodes, declaredVars, graphName, errors);
        break;
      case "group":
        checkExprSources(expr.inner, seenNodes, declaredVars, graphName, errors);
        break;
      case "call":
        if (!(expr.name in BUILTIN_FUNCTIONS)) {
          errors.push(new GraftError(
            `Unknown function '${expr.name}' in graph '${graphName}'`,
            expr.location,
            "error",
            "SCOPE_UNKNOWN_FUNCTION"
          ));
        }
        for (const arg of expr.args) {
          checkExprSources(arg, seenNodes, declaredVars, graphName, errors);
        }
        break;
      case "template":
        for (const part of expr.parts) {
          if (part.kind === "expr") {
            checkExprSources(part.value, seenNodes, declaredVars, graphName, errors);
          }
        }
        break;
      case "conditional":
        checkExprSources(expr.condition, seenNodes, declaredVars, graphName, errors);
        checkExprSources(expr.consequent, seenNodes, declaredVars, graphName, errors);
        checkExprSources(expr.alternate, seenNodes, declaredVars, graphName, errors);
        break;
      default: {
        const _exhaustive = expr;
        throw new Error(`Unhandled expression kind: ${_exhaustive.kind}`);
      }
    }
  }
  function checkGraphCallArgs(args, graphDecl, seenNodes, declaredVars, graphName, location, index, errors) {
    const paramMap = new Map(graphDecl.params.map((p) => [p.name, p]));
    const providedNames = /* @__PURE__ */ new Set();
    for (const arg of args) {
      providedNames.add(arg.name);
      const param = paramMap.get(arg.name);
      if (!param) {
        errors.push(new GraftError(
          `Unknown parameter '${arg.name}' in call to graph '${graphDecl.name}'`,
          arg.location,
          "error",
          "SCOPE_GRAPH_PARAM_TYPE"
        ));
        continue;
      }
      if (param.type === "Node") {
        if (arg.value.kind !== "field_access" || arg.value.segments.length !== 1) {
          errors.push(new GraftError(
            `Parameter '${arg.name}' of type Node requires a node name, not an expression`,
            arg.location,
            "error",
            "SCOPE_GRAPH_PARAM_TYPE"
          ));
        } else if (!index.nodeMap.has(arg.value.segments[0])) {
          errors.push(new GraftError(
            `Parameter '${arg.name}' references undeclared node '${arg.value.segments[0]}'`,
            arg.location,
            "error",
            "SCOPE_UNDEFINED_REF"
          ));
        }
      } else {
        checkExprSources(arg.value, seenNodes, declaredVars, graphName, errors);
        if (arg.value.kind === "literal") {
          if (!checkLiteralParamType(arg.value.value, param.type)) {
            errors.push(new GraftError(
              `Parameter '${arg.name}' expects type ${param.type}, got ${typeof arg.value.value}`,
              arg.location,
              "error",
              "SCOPE_GRAPH_PARAM_TYPE"
            ));
          }
        }
      }
    }
    for (const param of graphDecl.params) {
      if (!providedNames.has(param.name) && param.default === void 0) {
        errors.push(new GraftError(
          `Missing required parameter '${param.name}' in call to graph '${graphDecl.name}'`,
          location,
          "error",
          "SCOPE_GRAPH_PARAM_MISSING"
        ));
      }
    }
  }
  function checkGraphRecursion(graphs, index, errors) {
    const callGraph = /* @__PURE__ */ new Map();
    for (const graph of graphs) {
      const calls = /* @__PURE__ */ new Set();
      collectGraphCalls(graph.flow, calls);
      callGraph.set(graph.name, calls);
    }
    const visited = /* @__PURE__ */ new Set();
    const inStack = /* @__PURE__ */ new Set();
    for (const graphName of callGraph.keys()) {
      if (visited.has(graphName)) continue;
      dfsGraphCycles(graphName, callGraph, visited, inStack, index, errors);
    }
  }
  function collectGraphCalls(nodes, calls) {
    for (const step of nodes) {
      if (step.kind === "graph_call") {
        calls.add(step.name);
      } else if (step.kind === "foreach") {
        collectGraphCalls(step.body, calls);
      }
    }
  }
  function dfsGraphCycles(current, callGraph, visited, inStack, index, errors) {
    visited.add(current);
    inStack.add(current);
    const calls = callGraph.get(current);
    if (calls) {
      for (const callee of calls) {
        if (inStack.has(callee)) {
          const graph = index.graphMap.get(current);
          errors.push(new GraftError(
            `Recursive graph call detected: '${current}' calls '${callee}' which creates a cycle`,
            graph?.location ?? { line: 0, column: 0, offset: 0 },
            "error",
            "SCOPE_GRAPH_RECURSION"
          ));
        } else if (!visited.has(callee)) {
          dfsGraphCycles(callee, callGraph, visited, inStack, index, errors);
        }
      }
    }
    inStack.delete(current);
  }
  function checkLiteralParamType(value, type) {
    switch (type) {
      case "Int":
        return typeof value === "number";
      case "String":
        return typeof value === "string";
      case "Bool":
        return typeof value === "boolean";
      default:
        return false;
    }
  }

  // src/analyzer/scope.ts
  var ScopeChecker = class {
    program;
    nodeWritesMap;
    // node name -> writes targets
    index;
    constructor(program, index) {
      this.program = program;
      this.index = index ?? new ProgramIndex(program);
      this.nodeWritesMap = /* @__PURE__ */ new Map();
      for (const node of program.nodes) {
        this.nodeWritesMap.set(node.name, node.writes);
      }
    }
    check() {
      const errors = [];
      this.checkDuplicateNames(errors);
      this.checkMaxTokens(errors);
      this.checkNodeReads(errors);
      this.checkNodeWrites(errors);
      this.checkEdges(errors);
      this.checkMultipleGraphs(errors);
      this.checkGraphFlow(errors);
      checkGraphRecursion(this.program.graphs, this.index, errors);
      this.checkFailureStrategies(errors);
      return errors;
    }
    checkDuplicateNames(errors) {
      for (const mem of this.program.memories) {
        if (this.index.contextMap.has(mem.name)) {
          errors.push(new GraftError(
            `Name '${mem.name}' is declared as both a context and a memory`,
            mem.location,
            "error",
            "SCOPE_DUPLICATE_NAME"
          ));
        }
        if (this.index.producesFieldsMap.has(mem.name)) {
          errors.push(new GraftError(
            `Name '${mem.name}' conflicts with a produces declaration`,
            mem.location,
            "error",
            "SCOPE_DUPLICATE_NAME"
          ));
        }
      }
    }
    checkMaxTokens(errors) {
      for (const ctx of this.program.contexts) {
        if (ctx.maxTokens <= 0) {
          errors.push(new GraftError(
            `Context '${ctx.name}' has invalid max_tokens: ${ctx.maxTokens} (must be > 0)`,
            ctx.location,
            "error",
            "SCOPE_MAX_TOKENS_INVALID"
          ));
        }
      }
      for (const mem of this.program.memories) {
        if (mem.maxTokens <= 0) {
          errors.push(new GraftError(
            `Memory '${mem.name}' has invalid max_tokens: ${mem.maxTokens} (must be > 0)`,
            mem.location,
            "error",
            "SCOPE_MAX_TOKENS_INVALID"
          ));
        }
      }
    }
    checkNodeReads(errors) {
      for (const node of this.program.nodes) {
        for (const ref of node.reads) {
          const isContext = this.index.contextMap.has(ref.context);
          const isProduces = this.index.producesFieldsMap.has(ref.context);
          const isMemory = this.index.memoryMap.has(ref.context);
          if (!isContext && !isProduces && !isMemory) {
            const allNames = [
              ...this.index.contextMap.keys(),
              ...this.index.producesFieldsMap.keys(),
              ...this.index.memoryMap.keys()
            ];
            const suggestion = didYouMean(ref.context, allNames);
            const help = suggestion ? `did you mean '${suggestion}'?` : void 0;
            errors.push(new GraftError(
              `'${ref.context}' is not declared as a context, produces output, or memory`,
              ref.location,
              "error",
              "SCOPE_UNDEFINED_REF",
              help
            ));
            continue;
          }
          if (ref.field) {
            if (isContext) {
              const ctx = this.index.contextMap.get(ref.context);
              const fieldNames = ctx.fields.map((f) => f.name);
              const fieldSet = new Set(fieldNames);
              for (const f of ref.field) {
                if (!fieldSet.has(f)) {
                  const suggestion = didYouMean(f, fieldNames);
                  errors.push(new GraftError(
                    `Field '${f}' does not exist in context '${ref.context}'`,
                    ref.location,
                    "error",
                    "SCOPE_FIELD_NOT_FOUND",
                    suggestion ? `did you mean '${suggestion}'?` : void 0
                  ));
                }
              }
            } else if (isProduces) {
              const fields = this.index.producesFieldsMap.get(ref.context);
              for (const f of ref.field) {
                if (!fields.has(f)) {
                  const suggestion = didYouMean(f, [...fields.keys()]);
                  errors.push(new GraftError(
                    `Field '${f}' does not exist in produces '${ref.context}'`,
                    ref.location,
                    "error",
                    "SCOPE_FIELD_NOT_FOUND",
                    suggestion ? `did you mean '${suggestion}'?` : void 0
                  ));
                }
              }
            } else if (isMemory) {
              const fields = this.index.memoryFieldsMap.get(ref.context);
              for (const f of ref.field) {
                if (!fields.has(f)) {
                  errors.push(new GraftError(
                    `Field '${f}' does not exist in memory '${ref.context}'`,
                    ref.location,
                    "error",
                    "SCOPE_FIELD_NOT_FOUND"
                  ));
                }
              }
            }
          }
        }
      }
    }
    checkNodeWrites(errors) {
      for (const node of this.program.nodes) {
        for (const writeRef of node.writes) {
          if (!this.index.memoryMap.has(writeRef.memory)) {
            errors.push(new GraftError(
              `writes target '${writeRef.memory}' is not a declared memory`,
              writeRef.location,
              "error",
              "SCOPE_INVALID_WRITES"
            ));
          } else if (writeRef.field) {
            const fields = this.index.memoryFieldsMap.get(writeRef.memory);
            if (!fields.has(writeRef.field)) {
              errors.push(new GraftError(
                `Field '${writeRef.field}' does not exist in memory '${writeRef.memory}'`,
                writeRef.location,
                "error",
                "SCOPE_FIELD_NOT_FOUND"
              ));
            }
          }
        }
      }
    }
    checkEdges(errors) {
      for (const edge of this.program.edges) {
        if (!this.index.nodeMap.has(edge.source)) {
          errors.push(new GraftError(
            `Edge source '${edge.source}' is not a declared node`,
            edge.location,
            "error",
            "SCOPE_UNDEFINED_REF"
          ));
        }
        if (edge.target.kind === "direct") {
          if (!this.index.nodeMap.has(edge.target.node)) {
            errors.push(new GraftError(
              `Edge target '${edge.target.node}' is not a declared node`,
              edge.location,
              "error",
              "SCOPE_UNDEFINED_REF"
            ));
          }
        } else {
          for (const branch of edge.target.branches) {
            if (branch.target !== "done" && !this.index.nodeMap.has(branch.target)) {
              errors.push(new GraftError(
                `Edge target '${branch.target}' is not a declared node`,
                edge.location,
                "error",
                "SCOPE_UNDEFINED_REF"
              ));
            }
          }
        }
      }
    }
    checkMultipleGraphs(errors) {
      if (this.program.graphs.length > 1) {
        errors.push(new GraftError(
          `Multiple graphs declared; only the first graph '${this.program.graphs[0].name}' will be executed`,
          this.program.graphs[1].location,
          "warning",
          "GRAPH_MULTIPLE"
        ));
      }
    }
    checkGraphFlow(errors) {
      for (const graph of this.program.graphs) {
        if (!this.index.contextMap.has(graph.input)) {
          errors.push(new GraftError(
            `Graph input '${graph.input}' is not a declared context`,
            graph.location,
            "error",
            "SCOPE_UNDEFINED_REF"
          ));
        }
        if (!this.index.producesFieldsMap.has(graph.output)) {
          errors.push(new GraftError(
            `Graph output '${graph.output}' is not a declared produces type`,
            graph.location,
            "error",
            "SCOPE_UNDEFINED_REF"
          ));
        }
        const paramNodes = /* @__PURE__ */ new Set();
        for (const param of graph.params) {
          if (param.type === "Node") {
            paramNodes.add(param.name);
          }
        }
        this.walkFlowNodes(graph.flow, graph.location, errors, graph.name, void 0, paramNodes);
      }
    }
    walkFlowNodes(nodes, location, errors, graphName, declaredVars, seenNodes) {
      const vars = declaredVars ?? /* @__PURE__ */ new Set();
      const seen = seenNodes ?? /* @__PURE__ */ new Set();
      for (const step of nodes) {
        switch (step.kind) {
          case "node":
            if (!this.index.nodeMap.has(step.name) && !seen.has(step.name)) {
              errors.push(new GraftError(
                `Node '${step.name}' in graph flow is not declared`,
                step.location ?? location,
                "error",
                "SCOPE_UNDEFINED_REF"
              ));
            } else {
              seen.add(step.name);
            }
            break;
          case "parallel":
            for (const branch of step.branches) {
              if (!this.index.nodeMap.has(branch)) {
                errors.push(new GraftError(
                  `Node '${branch}' in parallel block is not declared`,
                  step.location ?? location,
                  "error",
                  "SCOPE_UNDEFINED_REF"
                ));
              } else {
                seen.add(branch);
              }
            }
            this.checkParallelWrites(step.branches, step.location ?? location, errors);
            break;
          case "foreach": {
            if (!this.index.nodeMap.has(step.source)) {
              errors.push(new GraftError(
                `Foreach source node '${step.source}' is not declared`,
                step.location ?? location,
                "error",
                "SCOPE_UNDEFINED_REF"
              ));
            }
            const sourceNode = this.index.nodeMap.get(step.source);
            if (sourceNode) {
              const fieldNames = new Set(sourceNode.produces.fields.map((f) => f.name));
              if (!fieldNames.has(step.field)) {
                errors.push(new GraftError(
                  `Field '${step.field}' does not exist in '${step.source}' produces output`,
                  step.location ?? location,
                  "error",
                  "SCOPE_FIELD_NOT_FOUND"
                ));
              }
            }
            if (step.maxIterations < 1) {
              errors.push(new GraftError(
                "foreach max_iterations must be at least 1",
                step.location ?? location,
                "error",
                "SCOPE_INVALID_FOREACH"
              ));
            }
            const binding = step.binding;
            if (this.index.nodeMap.has(binding)) {
              errors.push(new GraftError(
                `Foreach binding '${binding}' collides with declared node '${binding}'`,
                step.location ?? location,
                "warning",
                "SCOPE_BINDING_COLLISION"
              ));
            } else if (this.index.producesFieldsMap.has(binding)) {
              errors.push(new GraftError(
                `Foreach binding '${binding}' collides with produces declaration '${binding}'`,
                step.location ?? location,
                "warning",
                "SCOPE_BINDING_COLLISION"
              ));
            } else if (this.index.contextMap.has(binding)) {
              errors.push(new GraftError(
                `Foreach binding '${binding}' collides with declared context '${binding}'`,
                step.location ?? location,
                "warning",
                "SCOPE_BINDING_COLLISION"
              ));
            } else if (this.index.memoryMap.has(binding)) {
              errors.push(new GraftError(
                `Foreach binding '${binding}' collides with declared memory '${binding}'`,
                step.location ?? location,
                "warning",
                "SCOPE_BINDING_COLLISION"
              ));
            }
            const bodyVars = new Set(vars);
            bodyVars.add(binding);
            this.walkFlowNodes(step.body, step.location ?? location, errors, graphName, bodyVars, seen);
            break;
          }
          case "let": {
            const loc = step.location ?? location;
            if (vars.has(step.name)) {
              errors.push(new GraftError(
                `Variable '${step.name}' is already declared in graph '${graphName}'`,
                loc,
                "error",
                "SCOPE_VAR_COLLISION"
              ));
            }
            checkVarCollision(step.name, graphName, loc, this.index, errors);
            checkExprSources(step.value, seen, vars, graphName, errors);
            vars.add(step.name);
            break;
          }
          case "graph_call": {
            const loc = step.location ?? location;
            const graphDecl = this.index.graphMap.get(step.name);
            if (!graphDecl) {
              errors.push(new GraftError(
                `Graph '${step.name}' in graph call is not declared`,
                loc,
                "error",
                "SCOPE_UNDEFINED_REF"
              ));
            } else {
              checkGraphCallArgs(step.args, graphDecl, seen, vars, graphName, loc, this.index, errors);
            }
            break;
          }
          default: {
            const _exhaustive = step;
            throw new Error(`Unhandled FlowNode kind: ${_exhaustive.kind}`);
          }
        }
      }
    }
    checkFailureStrategies(errors) {
      for (const node of this.program.nodes) {
        if (!node.onFailure) continue;
        const strategy = node.onFailure;
        if (strategy.type === "fallback" || strategy.type === "retry_then_fallback") {
          if (!this.index.nodeMap.has(strategy.node)) {
            errors.push(new GraftError(
              `Fallback node '${strategy.node}' in '${node.name}' on_failure is not a declared node`,
              node.location,
              "error",
              "SCOPE_INVALID_FALLBACK"
            ));
          }
        }
      }
      this.checkFallbackCycles(errors);
    }
    checkFallbackCycles(errors) {
      const fallbackEdges = /* @__PURE__ */ new Map();
      const nodeLocationMap = /* @__PURE__ */ new Map();
      for (const node of this.program.nodes) {
        nodeLocationMap.set(node.name, node.location);
        if (!node.onFailure) continue;
        const strategy = node.onFailure;
        if (strategy.type === "fallback" || strategy.type === "retry_then_fallback") {
          fallbackEdges.set(node.name, strategy.node);
        }
      }
      const visited = /* @__PURE__ */ new Set();
      const inStack = /* @__PURE__ */ new Set();
      for (const start of fallbackEdges.keys()) {
        if (visited.has(start)) continue;
        const stack = [start];
        while (stack.length > 0) {
          const current = stack[stack.length - 1];
          if (!inStack.has(current)) {
            inStack.add(current);
            visited.add(current);
            const target = fallbackEdges.get(current);
            if (target) {
              if (inStack.has(target)) {
                errors.push(new GraftError(
                  `Fallback cycle detected: '${current}' falls back to '${target}' which creates a cycle`,
                  nodeLocationMap.get(current),
                  "error",
                  "SCOPE_FALLBACK_CYCLE"
                ));
              } else if (!visited.has(target)) {
                stack.push(target);
                continue;
              }
            }
          }
          stack.pop();
          inStack.delete(current);
        }
      }
    }
    checkParallelWrites(branches, location, errors) {
      const memoryWriters = /* @__PURE__ */ new Map();
      for (const branch of branches) {
        const writes = this.nodeWritesMap.get(branch);
        if (!writes) continue;
        for (const writeRef of writes) {
          const memName = writeRef.memory;
          const writers = memoryWriters.get(memName);
          if (writers) {
            writers.push(branch);
          } else {
            memoryWriters.set(memName, [branch]);
          }
        }
      }
      for (const [memName, writers] of memoryWriters) {
        if (writers.length > 1) {
          errors.push(new GraftError(
            `Nodes ${writers.map((w) => `'${w}'`).join(" and ")} both write to memory '${memName}' in parallel`,
            location,
            "warning",
            "SCOPE_PARALLEL_WRITES"
          ));
        }
      }
    }
  };

  // src/analyzer/types.ts
  var TypeChecker = class {
    program;
    index;
    constructor(program, index) {
      this.program = program;
      this.index = index ?? new ProgramIndex(program);
    }
    check() {
      const diagnostics = [];
      this.checkEdgeTransforms(diagnostics);
      this.checkWritesSchemaOverlap(diagnostics);
      this.checkConditionTypes(diagnostics);
      this.checkExprTypes(diagnostics);
      return diagnostics;
    }
    checkWritesSchemaOverlap(diagnostics) {
      for (const node of this.program.nodes) {
        if (node.writes.length === 0) continue;
        const producesFields = this.index.producesFieldsMap.get(node.name);
        if (!producesFields) continue;
        for (const writeRef of node.writes) {
          const memoryFields = this.index.memoryFieldsMap.get(writeRef.memory);
          if (!memoryFields) continue;
          let hasOverlap = false;
          for (const field of producesFields.keys()) {
            if (memoryFields.has(field)) {
              hasOverlap = true;
              break;
            }
          }
          if (!hasOverlap) {
            diagnostics.push(new GraftError(
              `Node '${node.name}' writes to memory '${writeRef.memory}' but produces no matching fields`,
              node.location,
              "warning",
              "TYPE_SCHEMA_MISMATCH"
            ));
          }
        }
      }
    }
    checkEdgeTransforms(errors) {
      for (const edge of this.program.edges) {
        const sourceFields = this.index.producesFieldsMap.get(edge.source);
        if (!sourceFields) continue;
        for (const transform of edge.transforms) {
          if (transform.type === "select") {
            for (const f of transform.fields) {
              if (!sourceFields.has(f)) {
                errors.push(new GraftError(
                  `select: field '${f}' does not exist in '${edge.source}' output`,
                  edge.location,
                  "error",
                  "TYPE_FIELD_NOT_FOUND"
                ));
              }
            }
          } else if (transform.type === "filter") {
            if (!sourceFields.has(transform.field)) {
              errors.push(new GraftError(
                `filter: field '${transform.field}' does not exist in '${edge.source}' output`,
                edge.location,
                "error",
                "TYPE_FIELD_NOT_FOUND"
              ));
            }
          } else if (transform.type === "drop") {
            if (!sourceFields.has(transform.field)) {
              errors.push(new GraftError(
                `drop: field '${transform.field}' does not exist in '${edge.source}' output`,
                edge.location,
                "error",
                "TYPE_FIELD_NOT_FOUND"
              ));
            }
          }
        }
      }
    }
    checkConditionTypes(errors) {
      for (const edge of this.program.edges) {
        if (edge.target.kind !== "conditional") continue;
        const sourceFields = this.index.producesFieldsMap.get(edge.source);
        if (!sourceFields) continue;
        for (const branch of edge.target.branches) {
          if (!branch.condition) continue;
          const cond = branch.condition;
          if (cond.kind !== "binary") continue;
          const { op } = cond;
          if (op === "==" || op === "!=") continue;
          const field = cond.left.kind === "field_access" ? cond.left.segments.join(".") : cond.left.kind === "call" ? `${cond.left.name}(...)` : "<expr>";
          const fieldType = sourceFields.get(field);
          if (!fieldType) continue;
          if (!isNumericType(fieldType)) {
            errors.push(new GraftError(
              `Ordered comparison '${op}' requires numeric type, but field '${field}' has type '${fieldType.kind === "primitive" ? fieldType.name : fieldType.kind}'`,
              edge.location,
              "error",
              "TYPE_CONDITION_MISMATCH"
            ));
          }
        }
      }
    }
    checkExprTypes(errors) {
      for (const graph of this.program.graphs) {
        const varTypes = /* @__PURE__ */ new Map();
        this.walkFlowForTypes(graph.flow, varTypes, errors);
        this.checkVarConditionTypes(varTypes, errors);
      }
    }
    walkFlowForTypes(nodes, varTypes, errors) {
      for (const step of nodes) {
        if (step.kind === "let") {
          const inferred = this.inferExprType(step.value, varTypes);
          varTypes.set(step.name, inferred);
          this.checkExprTypeErrors(step.value, varTypes, errors);
        } else if (step.kind === "foreach") {
          const bodyTypes = new Map(varTypes);
          bodyTypes.set(step.binding, "unknown");
          this.walkFlowForTypes(step.body, bodyTypes, errors);
        }
      }
    }
    inferExprType(expr, varTypes) {
      switch (expr.kind) {
        case "literal": {
          const v = expr.value;
          if (typeof v === "number") return "number";
          if (typeof v === "string") return "string";
          if (typeof v === "boolean") return "boolean";
          return "unknown";
        }
        case "field_access": {
          if (expr.segments.length === 1) {
            const varType = varTypes.get(expr.segments[0]);
            if (varType) return varType;
          }
          if (expr.segments.length >= 2) {
            const fields = this.index.producesFieldsMap.get(expr.segments[0]);
            if (fields) {
              const fieldType = fields.get(expr.segments[1]);
              if (fieldType) return typeExprToInferred(fieldType);
            }
          }
          return "unknown";
        }
        case "binary": {
          const leftType = this.inferExprType(expr.left, varTypes);
          const rightType = this.inferExprType(expr.right, varTypes);
          if (expr.op === "??") {
            if (leftType !== "unknown") return leftType;
            return rightType;
          }
          if (expr.op === "&&" || expr.op === "||") return "boolean";
          if (expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=" || expr.op === "==" || expr.op === "!=") {
            return "boolean";
          }
          if (expr.op === "+") {
            if (leftType === "string" || rightType === "string") return "string";
            if (leftType === "number" && rightType === "number") return "number";
            return "unknown";
          }
          return "number";
        }
        case "unary": {
          if (expr.op === "!") return "boolean";
          return "number";
        }
        case "group":
          return this.inferExprType(expr.inner, varTypes);
        case "call": {
          const builtin = BUILTIN_FUNCTIONS[expr.name];
          return builtin?.returnType ?? "unknown";
        }
        case "template":
          return "string";
        case "conditional": {
          const consequentType = this.inferExprType(expr.consequent, varTypes);
          const alternateType = this.inferExprType(expr.alternate, varTypes);
          if (consequentType === alternateType) return consequentType;
          return "unknown";
        }
        default: {
          const _exhaustive = expr;
          return _exhaustive;
        }
      }
    }
    checkExprTypeErrors(expr, varTypes, errors) {
      if (expr.kind === "binary") {
        const leftType = this.inferExprType(expr.left, varTypes);
        const rightType = this.inferExprType(expr.right, varTypes);
        if (leftType !== "unknown" && rightType !== "unknown") {
          if (expr.op === "??") {
          } else if (expr.op === "&&" || expr.op === "||") {
            if (leftType !== "boolean" || rightType !== "boolean") {
              errors.push(new GraftError(
                `Operator '${expr.op}' expects boolean operands, got '${leftType}' and '${rightType}'`,
                expr.location,
                "warning",
                "TYPE_EXPR_MISMATCH"
              ));
            }
          } else if (expr.op === "==" || expr.op === "!=") {
          } else if (expr.op === "<" || expr.op === ">" || expr.op === "<=" || expr.op === ">=") {
            if (leftType !== "number" || rightType !== "number") {
              errors.push(new GraftError(
                `Operator '${expr.op}' requires numeric operands, got '${leftType}' and '${rightType}'`,
                expr.location,
                "error",
                "TYPE_EXPR_MISMATCH"
              ));
            }
          } else if (expr.op === "+") {
            if (leftType !== rightType) {
              errors.push(new GraftError(
                `Operator '+' cannot be applied to types '${leftType}' and '${rightType}'`,
                expr.location,
                "error",
                "TYPE_EXPR_MISMATCH"
              ));
            }
          } else {
            if (leftType !== "number" || rightType !== "number") {
              errors.push(new GraftError(
                `Operator '${expr.op}' requires numeric operands, got '${leftType}' and '${rightType}'`,
                expr.location,
                "error",
                "TYPE_EXPR_MISMATCH"
              ));
            }
          }
        }
        this.checkExprTypeErrors(expr.left, varTypes, errors);
        this.checkExprTypeErrors(expr.right, varTypes, errors);
      } else if (expr.kind === "unary") {
        const operandType = this.inferExprType(expr.operand, varTypes);
        if (operandType !== "unknown") {
          if (expr.op === "!" && operandType !== "boolean") {
            errors.push(new GraftError(
              `Operator '!' requires boolean operand, got '${operandType}'`,
              expr.location,
              "error",
              "TYPE_EXPR_MISMATCH"
            ));
          } else if (expr.op === "-" && operandType !== "number") {
            errors.push(new GraftError(
              `Unary '-' requires numeric operand, got '${operandType}'`,
              expr.location,
              "error",
              "TYPE_EXPR_MISMATCH"
            ));
          }
        }
        this.checkExprTypeErrors(expr.operand, varTypes, errors);
      } else if (expr.kind === "group") {
        this.checkExprTypeErrors(expr.inner, varTypes, errors);
      } else if (expr.kind === "call") {
        const builtin = BUILTIN_FUNCTIONS[expr.name];
        if (builtin && expr.args.length !== builtin.arity) {
          errors.push(new GraftError(
            `Function '${expr.name}' expects ${builtin.arity} argument(s), got ${expr.args.length}`,
            expr.location,
            "error",
            "TYPE_FUNC_ARITY"
          ));
        }
        for (const arg of expr.args) {
          this.checkExprTypeErrors(arg, varTypes, errors);
        }
      } else if (expr.kind === "template") {
        for (const part of expr.parts) {
          if (part.kind === "expr") {
            this.checkExprTypeErrors(part.value, varTypes, errors);
          }
        }
      } else if (expr.kind === "conditional") {
        const consType = this.inferExprType(expr.consequent, varTypes);
        const altType = this.inferExprType(expr.alternate, varTypes);
        if (consType !== "unknown" && altType !== "unknown" && consType !== altType) {
          errors.push(new GraftError(
            `Conditional branches have different types: '${consType}' and '${altType}'`,
            expr.location,
            "warning",
            "TYPE_CONDITIONAL_MISMATCH"
          ));
        }
        this.checkExprTypeErrors(expr.condition, varTypes, errors);
        this.checkExprTypeErrors(expr.consequent, varTypes, errors);
        this.checkExprTypeErrors(expr.alternate, varTypes, errors);
      }
    }
    checkVarConditionTypes(varTypes, errors) {
      for (const edge of this.program.edges) {
        if (edge.target.kind !== "conditional") continue;
        for (const branch of edge.target.branches) {
          if (!branch.condition) continue;
          const cond = branch.condition;
          if (cond.kind !== "binary") continue;
          const { op, left } = cond;
          if (op === "==" || op === "!=") continue;
          if (left.kind === "field_access" && left.segments.length === 1) {
            const varName = left.segments[0];
            const varType = varTypes.get(varName);
            if (varType && varType !== "unknown" && varType !== "number") {
              errors.push(new GraftError(
                `Ordered comparison '${op}' requires numeric type, but variable '${varName}' has type '${varType}'`,
                edge.location,
                "error",
                "TYPE_VAR_CONDITION"
              ));
            }
          }
        }
      }
    }
  };
  function typeExprToInferred(type) {
    if (type.kind === "primitive") {
      switch (type.name) {
        case "String":
          return "string";
        case "Int":
        case "Float":
          return "number";
        case "Bool":
          return "boolean";
      }
    }
    if (type.kind === "primitive_range") return "number";
    return "unknown";
  }
  function isNumericType(type) {
    if (type.kind === "primitive") return type.name === "Int" || type.name === "Float";
    if (type.kind === "primitive_range") return true;
    return false;
  }

  // src/constants.ts
  var MODEL_MAP = {
    sonnet: "claude-sonnet-4-20250514",
    opus: "claude-opus-4-20250514",
    haiku: "claude-haiku-4-5-20251001"
  };
  var PARTIAL_FIELD_FACTOR = 0.3;
  var BUDGET_WARNING_THRESHOLD = 0.8;
  var BUDGET_CRITICAL_THRESHOLD = 0.9;
  var MAX_CONDITIONAL_HOPS = 10;

  // src/analyzer/estimator.ts
  var TokenEstimator = class {
    program;
    index;
    nodeMap;
    edgeMap;
    // "source->target" key
    conditionalEdges;
    // source -> branches
    constructor(program, index) {
      this.program = program;
      this.index = index ?? new ProgramIndex(program);
      this.nodeMap = this.index.nodeMap;
      this.edgeMap = /* @__PURE__ */ new Map();
      this.conditionalEdges = /* @__PURE__ */ new Map();
      for (const edge of program.edges) {
        if (edge.target.kind === "direct") {
          this.edgeMap.set(`${edge.source}->${edge.target.node}`, edge);
        } else {
          this.conditionalEdges.set(
            edge.source,
            edge.target.branches
          );
        }
      }
    }
    estimate() {
      const graph = this.program.graphs[0];
      if (!graph) {
        return { graphName: "", budget: 0, bestCase: 0, worstCase: 0, nodes: [], warnings: [] };
      }
      const warnings = [];
      const nodeReports = [];
      this.collectNodeReports(graph.flow, nodeReports, warnings);
      const { best, worst } = this.computeFlowCosts(graph.flow, warnings);
      const bestCase = best;
      const worstCase = worst;
      if (worstCase > graph.budget) {
        warnings.push(new GraftError(
          `Worst-case token usage (${worstCase}) exceeds budget (${graph.budget})`,
          graph.location,
          "warning",
          "BUDGET_EXCEEDED"
        ));
      }
      return {
        graphName: graph.name,
        budget: graph.budget,
        bestCase,
        worstCase,
        nodes: nodeReports,
        warnings
      };
    }
    collectNodeReports(steps, reports, warnings) {
      for (const step of steps) {
        switch (step.kind) {
          case "node": {
            const node = this.nodeMap.get(step.name);
            if (!node) break;
            const estimatedIn = this.getEstimatedIn(step.name, node);
            if (estimatedIn > node.budgetIn) {
              warnings.push(new GraftError(
                `Node '${step.name}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
                node.location,
                "warning",
                "BUDGET_NODE_EXCEEDED"
              ));
            }
            reports.push({ name: step.name, estimatedIn, estimatedOut: node.budgetOut });
            break;
          }
          case "parallel":
            for (const branchName of step.branches) {
              const node = this.nodeMap.get(branchName);
              if (!node) continue;
              const estimatedIn = this.getEstimatedIn(branchName, node);
              if (estimatedIn > node.budgetIn) {
                warnings.push(new GraftError(
                  `Node '${branchName}' estimated input (${estimatedIn}) exceeds budgetIn (${node.budgetIn})`,
                  node.location,
                  "warning",
                  "BUDGET_NODE_EXCEEDED"
                ));
              }
              reports.push({ name: branchName, estimatedIn, estimatedOut: node.budgetOut });
            }
            break;
          case "foreach":
            this.collectNodeReports(step.body, reports, warnings);
            break;
          case "let":
            break;
          case "graph_call": {
            const calledGraph = this.index.graphMap.get(step.name);
            if (calledGraph) {
              this.collectNodeReports(calledGraph.flow, reports, warnings);
            }
            break;
          }
          default: {
            const _exhaustive = step;
            throw new Error(`Unhandled FlowNode kind: ${_exhaustive.kind}`);
          }
        }
      }
    }
    computeFlowCosts(steps, warnings) {
      let best = 0;
      let worst = 0;
      for (const step of steps) {
        switch (step.kind) {
          case "node": {
            const node = this.nodeMap.get(step.name);
            if (!node) break;
            const cost = this.getNodeCost(step.name, node);
            const retryMul = this.getRetryMultiplier(node);
            best += cost;
            worst += cost * retryMul + this.getFallbackCost(node);
            const branchCosts = this.getConditionalBranchCosts(
              step.name,
              warnings,
              /* @__PURE__ */ new Set([step.name]),
              0
            );
            best += branchCosts.best;
            worst += branchCosts.worst;
            break;
          }
          case "parallel": {
            for (const branchName of step.branches) {
              const node = this.nodeMap.get(branchName);
              if (!node) continue;
              const cost = this.getNodeCost(branchName, node);
              const retryMul = this.getRetryMultiplier(node);
              best += cost;
              worst += cost * retryMul + this.getFallbackCost(node);
            }
            break;
          }
          case "foreach": {
            const bodyCosts = this.computeFlowCosts(step.body, warnings);
            best += bodyCosts.best * 1;
            worst += bodyCosts.worst * step.maxIterations;
            break;
          }
          case "let":
            break;
          case "graph_call": {
            const calledGraph = this.index.graphMap.get(step.name);
            if (calledGraph) {
              const subCosts = this.computeFlowCosts(calledGraph.flow, warnings);
              best += subCosts.best;
              worst += subCosts.worst;
            }
            break;
          }
          default: {
            const _exhaustive = step;
            throw new Error(`Unhandled FlowNode kind: ${_exhaustive.kind}`);
          }
        }
      }
      return { best, worst };
    }
    getConditionalBranchCosts(source, warnings, visited, depth) {
      const branches = this.conditionalEdges.get(source);
      if (!branches) return { best: 0, worst: 0 };
      if (depth >= MAX_CONDITIONAL_HOPS) {
        warnings.push(new GraftError(
          `Conditional chain from '${source}' exceeded maximum depth of ${MAX_CONDITIONAL_HOPS}`,
          { line: 0, column: 0, offset: 0 },
          "warning",
          "BUDGET_CHAIN_DEPTH"
        ));
        return { best: 0, worst: 0 };
      }
      const branchBestCosts = [];
      const branchWorstCosts = [];
      for (const branch of branches) {
        if (branch.target === "done") {
          branchBestCosts.push(0);
          branchWorstCosts.push(0);
          continue;
        }
        if (visited.has(branch.target)) {
          warnings.push(new GraftError(
            `Conditional estimation cycle detected: ${[...visited, branch.target].join(" -> ")}`,
            { line: 0, column: 0, offset: 0 },
            "warning",
            "BUDGET_CHAIN_CYCLE"
          ));
          branchBestCosts.push(0);
          branchWorstCosts.push(0);
          continue;
        }
        const node = this.nodeMap.get(branch.target);
        if (!node) continue;
        const cost = this.getNodeCost(branch.target, node);
        const retryMul = this.getRetryMultiplier(node);
        const branchVisited = new Set(visited);
        branchVisited.add(branch.target);
        const chainCosts = this.getConditionalBranchCosts(
          branch.target,
          warnings,
          branchVisited,
          depth + 1
        );
        branchBestCosts.push(cost + chainCosts.best);
        branchWorstCosts.push(cost * retryMul + chainCosts.worst);
      }
      if (branchBestCosts.length === 0) return { best: 0, worst: 0 };
      return { best: Math.min(...branchBestCosts), worst: Math.max(...branchWorstCosts) };
    }
    getNodeCost(nodeName, node) {
      return this.getEstimatedIn(nodeName, node) + node.budgetOut;
    }
    getEstimatedIn(nodeName, node) {
      let estimatedIn = 0;
      for (const ref of node.reads) {
        const ctx = this.index.contextMap.get(ref.context);
        if (ctx) {
          estimatedIn += ref.field ? Math.floor(ctx.maxTokens * Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1)) : ctx.maxTokens;
          continue;
        }
        const mem = this.index.memoryMap.get(ref.context);
        if (mem) {
          estimatedIn += ref.field ? Math.floor(mem.maxTokens * Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1)) : mem.maxTokens;
          continue;
        }
        const sourceNode = this.index.producesNodeMap.get(ref.context);
        if (sourceNode) {
          let upstreamTokens = sourceNode.budgetOut;
          const edgeKey = `${sourceNode.name}->${nodeName}`;
          const edge = this.edgeMap.get(edgeKey);
          if (edge) {
            upstreamTokens = this.applyTransformReductions(upstreamTokens, edge.transforms);
          }
          estimatedIn += ref.field ? Math.floor(upstreamTokens * Math.min(PARTIAL_FIELD_FACTOR * ref.field.length, 1)) : upstreamTokens;
        }
      }
      return estimatedIn;
    }
    applyTransformReductions(tokens, transforms) {
      let result = tokens;
      for (const t of transforms) {
        switch (t.type) {
          case "select":
            result = Math.floor(result * Math.min(PARTIAL_FIELD_FACTOR * t.fields.length, 1));
            break;
          case "filter":
            result = Math.floor(result * 0.5);
            break;
          case "drop":
            result = Math.floor(result * 0.85);
            break;
          case "compact":
            result = Math.floor(result * 0.7);
            break;
          case "truncate":
            result = Math.min(result, t.tokens);
            break;
        }
      }
      return result;
    }
    getRetryMultiplier(node) {
      if (!node.onFailure) return 1;
      switch (node.onFailure.type) {
        case "retry":
          return 1 + node.onFailure.max;
        case "retry_then_fallback":
          return 1 + node.onFailure.max;
        default:
          return 1;
      }
    }
    getFallbackCost(node) {
      if (!node.onFailure || node.onFailure.type !== "retry_then_fallback") return 0;
      const fallbackNode = this.nodeMap.get(node.onFailure.node);
      if (!fallbackNode) return 0;
      return this.getNodeCost(node.onFailure.node, fallbackNode);
    }
  };

  // src/utils.ts
  function fieldsToJsonExample(fields) {
    const obj = {};
    for (const field of fields) {
      obj[field.name] = typeToExample(field.type);
    }
    return obj;
  }
  function typeToExample(type) {
    switch (type.kind) {
      case "primitive":
        switch (type.name) {
          case "String":
            return "<string>";
          case "Int":
            return 0;
          case "Float":
            return 0;
          case "Bool":
            return false;
          default:
            return "<unknown>";
        }
      case "primitive_range":
        return type.min;
      case "list":
        return [typeToExample(type.element)];
      case "map":
        return {};
      case "optional":
        return typeToExample(type.inner);
      case "token_bounded":
        return typeToExample(type.inner);
      case "enum":
        return type.values.join("|");
      case "struct":
        return fieldsToJsonExample(type.fields);
      case "domain":
        return `<${type.name}>`;
    }
  }

  // src/codegen/agents.ts
  var TOOL_MAP = {
    file_read: ["Read"],
    file_write: ["Write", "Edit"],
    terminal: ["Bash"],
    ast_parse: ["Bash"],
    test_run: ["Bash"],
    lint: ["Bash"],
    browser: ["Bash"]
  };
  function generateAgent(node, memoryNames = /* @__PURE__ */ new Set(), inputOverrides = /* @__PURE__ */ new Map()) {
    const name = node.name.toLowerCase();
    const resolvedModel = MODEL_MAP[node.model] || node.model;
    const tools = resolveTools(node.tools);
    const jsonSchema = fieldsToJsonExample(node.produces.fields);
    const failureSection = formatFailure(node);
    const writesSection = formatWrites(node, memoryNames);
    const toolsLine = tools.length > 0 ? `
tools: [${tools.join(", ")}]` : "";
    return `---
name: ${name}
description: ${node.name} agent \u2014 produces ${node.produces.name}
model: ${resolvedModel}${toolsLine}
---

# ${node.name} Agent

## Context Loading
${formatReads(node, memoryNames, inputOverrides)}
${writesSection}## Output Contract
Produce JSON output matching this schema:
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

## Token Discipline
- Input budget: ${node.budgetIn} tokens. Read only what is necessary.
- Output budget: ${node.budgetOut} tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to \`.graft/session/node_outputs/${name}.json\`
2. Output: \`===NODE_COMPLETE:${name}===\`

${failureSection}`;
  }
  function resolveTools(tools) {
    const resolved = /* @__PURE__ */ new Set();
    for (const tool of tools) {
      const mapped = TOOL_MAP[tool];
      if (mapped) {
        for (const t of mapped) resolved.add(t);
      } else {
        resolved.add(tool);
      }
    }
    return [...resolved];
  }
  function formatReads(node, memoryNames, inputOverrides = /* @__PURE__ */ new Map()) {
    if (node.reads.length === 0) return "No external context required.";
    return node.reads.map((ref) => {
      const isMemory = memoryNames.has(ref.context);
      const fieldLabel = ref.field ? ref.field.length === 1 ? `.${ref.field[0]}` : `.{${ref.field.join(", ")}}` : "";
      const override = inputOverrides.get(ref.context);
      if (override) {
        return `- Load \`${ref.context}${fieldLabel}\` from \`${override}\``;
      }
      const dir = isMemory ? `.graft/memory/${ref.context.toLowerCase()}.json` : ".graft/session/";
      return `- Load \`${ref.context}${fieldLabel}\` from \`${dir}\``;
    }).join("\n");
  }
  function formatWrites(node, memoryNames) {
    const memoryWrites = node.writes.filter((w) => memoryNames.has(w.memory));
    if (memoryWrites.length === 0) return "";
    return `
## Memory Saving
After producing output, save to persistent memory:
${memoryWrites.map((w) => {
      const fieldLabel = w.field ? `.${w.field}` : "";
      return `- Save to \`.graft/memory/${w.memory.toLowerCase()}.json\`${fieldLabel ? ` (field: ${w.field})` : ""}`;
    }).join("\n")}

`;
  }
  function formatFailure(node) {
    const name = node.name.toLowerCase();
    if (!node.onFailure) {
      return `## Failure Protocol
On failure, output: \`===NODE_FAILED:${name}===\``;
    }
    switch (node.onFailure.type) {
      case "retry":
        return `## Failure Protocol
Retry up to ${node.onFailure.max} times. After ${node.onFailure.max} failures, output: \`===NODE_FAILED:${name}===\``;
      case "fallback":
        return `## Failure Protocol
On failure, delegate to ${node.onFailure.node} agent. If fallback also fails, output: \`===NODE_FAILED:${name}===\``;
      case "retry_then_fallback":
        return `## Failure Protocol
Retry up to ${node.onFailure.max} times. After ${node.onFailure.max} failures, delegate to ${node.onFailure.node} agent. If fallback also fails, output: \`===NODE_FAILED:${name}===\``;
      case "skip":
        return `## Failure Protocol
On failure, skip this node. Output: \`===NODE_SKIPPED:${name}===\``;
      case "abort":
        return `## Failure Protocol
On failure, abort the entire pipeline. Output: \`===PIPELINE_ABORTED:${name}===\``;
    }
  }

  // src/format.ts
  function formatExpr(expr) {
    switch (expr.kind) {
      case "literal":
        return typeof expr.value === "string" ? `"${expr.value}"` : String(expr.value);
      case "field_access":
        return expr.segments.join(".");
      case "binary":
        return `${formatExpr(expr.left)} ${expr.op} ${formatExpr(expr.right)}`;
      case "unary":
        return `${expr.op}${formatExpr(expr.operand)}`;
      case "group":
        return `(${formatExpr(expr.inner)})`;
      case "call":
        return `${expr.name}(${expr.args.map(formatExpr).join(", ")})`;
      case "template":
        return '"' + expr.parts.map((p) => p.kind === "text" ? p.value : `\${${formatExpr(p.value)}}`).join("") + '"';
      case "conditional":
        return `if ${formatExpr(expr.condition)} then ${formatExpr(expr.consequent)} else ${formatExpr(expr.alternate)}`;
      default: {
        const _exhaustive = expr;
        return _exhaustive;
      }
    }
  }

  // src/codegen/hooks.ts
  function generateHook(edge) {
    if (edge.transforms.length === 0) return null;
    if (edge.target.kind !== "direct") return null;
    const source = edge.source.toLowerCase();
    const target = edge.target.node.toLowerCase();
    const { code: transformCode, isCompact, needsCompactFn, needsTruncateFn } = transformsToJs(edge.transforms);
    const stringify = isCompact ? "JSON.stringify(result)" : "JSON.stringify(result, null, 2)";
    const helpers = [];
    if (needsCompactFn) {
      helpers.push(COMPACT_FN);
    }
    if (needsTruncateFn) {
      helpers.push(TRUNCATE_FN);
    }
    const helperSection = helpers.length > 0 ? "\n" + helpers.join("\n") + "\n" : "";
    return `#!/usr/bin/env node
// Auto-generated by Graft Compiler
// Edge: ${edge.source} -> ${edge.target.node}

const fs = require('fs');
const path = require('path');

const INPUT = path.resolve('.graft/session/node_outputs/${source}.json');
const OUTPUT = path.resolve('.graft/session/node_outputs/${source}_to_${target}.json');
const TOKEN_LOG = path.resolve('.graft/token_log.txt');

if (!fs.existsSync(INPUT)) {
  // Graceful no-op: this hook fires on ALL Write calls,
  // so the source output may not exist yet (different agent writing).
  process.exit(0);
}

const raw = fs.readFileSync(INPUT, 'utf-8');
const data = JSON.parse(raw);
${helperSection}
${transformCode}

const output = ${stringify};
fs.writeFileSync(OUTPUT, output);

// Token accounting
const original = Buffer.byteLength(raw);
const transformed = Buffer.byteLength(output);
const reduction = original > 0 ? Math.round((original - transformed) * 100 / original) : 0;
const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

fs.appendFileSync(TOKEN_LOG, \`[\${timestamp}] Edge ${edge.source}->${edge.target.node} | \${original}B -> \${transformed}B (\${reduction}% reduction)\\n\`);
`;
  }
  var COMPACT_FN = `function isEmpty(v) {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) return true;
  return false;
}
function compact(data) {
  if (data === null || data === undefined) return undefined;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(item => compact(item)).filter(item => !isEmpty(item));
  }
  const result = {};
  for (const [key, val] of Object.entries(data)) {
    const c = compact(val);
    if (!isEmpty(c)) result[key] = c;
  }
  return result;
}`;
  var TRUNCATE_FN = `function truncate(data, maxTokens) {
  const maxChars = maxTokens * 4;
  const json = JSON.stringify(data);
  if (json.length <= maxChars) return data;
  if (typeof data === 'string') return data.slice(0, maxChars) + '...';
  if (typeof data !== 'object' || data === null) return data;
  const ratio = maxChars / json.length;
  return truncateDeep(data, ratio);
}
function truncateDeep(data, ratio) {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    const maxLen = Math.max(10, Math.floor(data.length * ratio));
    return data.length > maxLen ? data.slice(0, maxLen) + '...' : data;
  }
  if (Array.isArray(data)) {
    const maxItems = Math.max(1, Math.floor(data.length * ratio));
    return data.slice(0, maxItems).map(item => truncateDeep(item, ratio));
  }
  if (typeof data === 'object') {
    const result = {};
    for (const [key, val] of Object.entries(data)) result[key] = truncateDeep(val, ratio);
    return result;
  }
  return data;
}`;
  function transformsToJs(transforms) {
    const selectFields = [];
    const dropFields = [];
    const filterExprs = [];
    let isCompact = false;
    let truncateTokens = null;
    for (const t of transforms) {
      switch (t.type) {
        case "select":
          selectFields.push(...t.fields);
          break;
        case "drop":
          dropFields.push(t.field);
          break;
        case "filter":
          filterExprs.push(filterToJs(t));
          break;
        case "compact":
          isCompact = true;
          break;
        case "truncate":
          truncateTokens = t.tokens;
          break;
      }
    }
    const lines = [];
    if (selectFields.length > 0) {
      const picks = selectFields.map((f) => `  ${JSON.stringify(f)}: data[${JSON.stringify(f)}]`).join(",\n");
      lines.push(`let result = {
${picks}
};`);
    } else {
      lines.push("let result = { ...data };");
    }
    for (const f of dropFields) {
      lines.push(`delete result[${JSON.stringify(f)}];`);
    }
    for (const expr of filterExprs) {
      lines.push(expr);
    }
    if (isCompact) {
      lines.push("result = compact(result);");
    }
    if (truncateTokens !== null) {
      lines.push(`result = truncate(result, ${truncateTokens});`);
    }
    return {
      code: lines.join("\n"),
      isCompact,
      needsCompactFn: isCompact,
      needsTruncateFn: truncateTokens !== null
    };
  }
  function filterToJs(t) {
    const { field, condition } = t;
    if (condition.kind !== "binary") return `result[${JSON.stringify(field)}] = result[${JSON.stringify(field)}];`;
    const fieldName = condition.left.kind === "field_access" ? condition.left.segments[condition.left.segments.length - 1] : formatExpr(condition.left);
    const valueStr = condition.right.kind === "literal" ? JSON.stringify(condition.right.value) : formatExpr(condition.right);
    const op = condition.op === "==" ? "===" : condition.op === "!=" ? "!==" : condition.op;
    return `result[${JSON.stringify(field)}] = (result[${JSON.stringify(field)}] || []).filter(item => item[${JSON.stringify(fieldName)}] ${op} ${valueStr});`;
  }
  function generateConditionalHook(edge) {
    if (edge.target.kind !== "conditional") return null;
    const source = edge.source.toLowerCase();
    const branches = edge.target.branches;
    const targets = branches.map((b) => b.target).filter((t) => t !== "done");
    const conditionCode = branchesToJs(branches);
    return `#!/usr/bin/env node
// Auto-generated by Graft Compiler
// Conditional routing: ${edge.source} -> {${branches.map((b) => b.target).join(", ")}}

const fs = require('fs');
const path = require('path');

const INPUT = path.resolve('.graft/session/node_outputs/${source}.json');
const ROUTE = path.resolve('.graft/session/routing/${source}_route.json');

if (!fs.existsSync(INPUT)) {
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(INPUT, 'utf-8'));

${conditionCode}

fs.mkdirSync(path.dirname(ROUTE), { recursive: true });
fs.writeFileSync(ROUTE, JSON.stringify({ target, from: ${JSON.stringify(edge.source)} }, null, 2));
`;
  }
  function branchesToJs(branches) {
    const lines = [];
    let first = true;
    for (const branch of branches) {
      if (!branch.condition) {
        if (first) {
          lines.push(`let target = ${JSON.stringify(branch.target)};`);
        } else {
          lines.push(`} else {`);
          lines.push(`  target = ${JSON.stringify(branch.target)};`);
          lines.push(`}`);
        }
      } else {
        const jsCondition = exprToJs(branch.condition);
        if (first) {
          lines.push(`let target = null;`);
          lines.push(`if (${jsCondition}) {`);
          lines.push(`  target = ${JSON.stringify(branch.target)};`);
          first = false;
        } else {
          lines.push(`} else if (${jsCondition}) {`);
          lines.push(`  target = ${JSON.stringify(branch.target)};`);
        }
      }
    }
    if (!first && !branches.some((b) => !b.condition)) {
      lines.push(`}`);
    }
    return lines.join("\n");
  }
  function exprToJs(expr) {
    if (expr.kind === "binary") {
      const left = exprToJs(expr.left);
      const right = exprToJs(expr.right);
      const op = expr.op === "==" ? "===" : expr.op === "!=" ? "!==" : expr.op;
      return `${left} ${op} ${right}`;
    }
    if (expr.kind === "field_access") {
      return `data[${JSON.stringify(expr.segments[0])}]`;
    }
    if (expr.kind === "literal") {
      return JSON.stringify(expr.value);
    }
    return formatExpr(expr);
  }

  // src/codegen/orchestration.ts
  function generateOrchestration(program, report) {
    const graph = program.graphs[0];
    if (!graph) return "";
    const index = new ProgramIndex(program);
    const memoryNames = new Set(program.memories.map((m) => m.name));
    const edgeMap = /* @__PURE__ */ new Map();
    const conditionalEdgeMap = /* @__PURE__ */ new Map();
    for (const edge of program.edges) {
      if (edge.target.kind === "direct" && edge.transforms.length > 0) {
        edgeMap.set(`${edge.source}->${edge.target.node}`, { transforms: edge.transforms });
      } else if (edge.target.kind === "conditional") {
        conditionalEdgeMap.set(edge.source, edge);
      }
    }
    const { text: steps } = generateSteps(graph.flow, report, edgeMap, conditionalEdgeMap, 1, null, index.nodeMap, memoryNames);
    const memorySection = program.memories.length > 0 ? `
## Persistent Memory
${program.memories.map((m) => `- \`${m.name}\`: \`.graft/memory/${m.name.toLowerCase()}.json\` (${m.maxTokens.toLocaleString("en-US")} tokens max)`).join("\n")}
- Memories persist across runs. Nodes with \`writes\` clauses update memory after execution.

` : "";
    const paramsSection = graph.params.length > 0 ? `
## Parameters
${graph.params.map((p) => `- ${p.name}: ${p.type}${p.default !== void 0 ? ` (default: ${p.default})` : ""}`).join("\n")}
` : "";
    return `# Graft Orchestration: ${graph.name}

> Auto-generated by Graft Compiler. Edit the .gft source, not this file.
${paramsSection}
## Budget
Total: ${graph.budget.toLocaleString("en-US")} tokens
Best case: ${report.bestCase.toLocaleString("en-US")} tokens
Worst case: ${report.worstCase.toLocaleString("en-US")} tokens
${memorySection}
## Execution Plan
${steps}
## Token Budget Tracking
Check \`.graft/token_log.txt\` after each step.
- 80% consumed: switch remaining agents to compact mode
- 90% consumed: skip non-critical agents

## Failure Recovery
- Agent failure: follow on_failure policy in each agent definition
- Token overrun: switch to compact mode, then skip non-critical steps
- Complete failure: intermediate results preserved in \`.graft/session/\`
`;
  }
  function describeTransforms(transforms) {
    const parts = [];
    for (const t of transforms) {
      switch (t.type) {
        case "select":
          parts.push(`keep only fields: ${t.fields.map((f) => `\`${f}\``).join(", ")}`);
          break;
        case "drop":
          parts.push(`remove field \`${t.field}\``);
          break;
        case "compact":
          parts.push("minify JSON (no whitespace)");
          break;
        case "filter":
          parts.push(`filter \`${t.field}\` array`);
          break;
        case "truncate":
          parts.push(`truncate to ${t.tokens} tokens`);
          break;
      }
    }
    return parts.join(", then ");
  }
  function describeCondition(expr) {
    if (expr.kind === "binary") {
      const left = expr.left.kind === "field_access" ? `\`${expr.left.segments[0]}\`` : formatExpr(expr.left);
      const right = expr.right.kind === "literal" ? `\`${expr.right.value}\`` : formatExpr(expr.right);
      return `${left} ${expr.op} ${right}`;
    }
    return formatExpr(expr);
  }
  function generateConditionalRoutingStep(stepNum, edge, nodeMap, report) {
    if (edge.target.kind !== "conditional") return "";
    const source = edge.source.toLowerCase();
    const branches = edge.target.branches;
    let text = `
### Step ${stepNum}: Conditional routing from ${edge.source}
- **Automatic**: Router hook evaluates conditions on ${edge.source}'s output
- Routing file: \`.graft/session/routing/${source}_route.json\`
- Read the \`target\` field and proceed accordingly:
`;
    for (const branch of branches) {
      const label = branch.condition ? describeCondition(branch.condition) : "else (default)";
      if (branch.target === "done") {
        text += `  - If ${label}: **pipeline complete**
`;
      } else {
        const nodeReport = report.nodes.find((n) => n.name === branch.target);
        const tokenInfo = nodeReport ? ` (tokens: input ~${nodeReport.estimatedIn.toLocaleString("en-US")} / output ~${nodeReport.estimatedOut.toLocaleString("en-US")})` : "";
        text += `  - If ${label}: run **${branch.target}** agent${tokenInfo}
`;
      }
    }
    text += `- Each branch agent reads from \`.graft/session/node_outputs/${source}.json\`
`;
    return text;
  }
  function generateSteps(flow, report, edgeMap, conditionalEdgeMap, startStep, prevNode, nodeMap, memoryNames) {
    let text = "";
    let stepNum = startStep;
    let prev = prevNode;
    let prevParallelBranches = [];
    for (const step of flow) {
      switch (step.kind) {
        case "node": {
          const lowerName = step.name.toLowerCase();
          const nodeReport = report.nodes.find((n) => n.name === step.name);
          let inputSource = "";
          let transformNote = "";
          if (prev) {
            const edgeInfo = edgeMap.get(`${prev}->${step.name}`);
            if (edgeInfo) {
              inputSource = `
- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}_to_${lowerName}.json\``;
              transformNote = `
- **Edge transform**: After ${prev} completes, transform its output: ${describeTransforms(edgeInfo.transforms)}. Save to \`.graft/session/node_outputs/${prev.toLowerCase()}_to_${lowerName}.json\` before starting ${step.name}.`;
            } else {
              inputSource = `
- Input: \`.graft/session/node_outputs/${prev.toLowerCase()}.json\``;
            }
          } else if (prevParallelBranches.length > 0) {
            const inputs = [];
            const transforms = [];
            for (const branch of prevParallelBranches) {
              const edgeInfo = edgeMap.get(`${branch}->${step.name}`);
              if (edgeInfo) {
                const transformedPath = `.graft/session/node_outputs/${branch.toLowerCase()}_to_${lowerName}.json`;
                inputs.push(`\`${transformedPath}\``);
                transforms.push(`- **Edge transform** (${branch} \u2192 ${step.name}): ${describeTransforms(edgeInfo.transforms)}. Run: \`node .claude/hooks/${branch.toLowerCase()}-to-${lowerName}.js\` or manually apply. Output: \`${transformedPath}\``);
              } else {
                inputs.push(`\`.graft/session/node_outputs/${branch.toLowerCase()}.json\``);
              }
            }
            inputSource = `
- Inputs: ${inputs.join(", ")}`;
            if (transforms.length > 0) {
              transformNote = "\n" + transforms.join("\n");
            }
          }
          let memoryLines = "";
          let additionalInputs = "";
          const nodeDecl = nodeMap.get(step.name);
          if (nodeDecl) {
            const memReads = nodeDecl.reads.filter((r) => memoryNames.has(r.context));
            for (const mr of memReads) {
              memoryLines += `
- Memory load: \`.graft/memory/${mr.context.toLowerCase()}.json\``;
            }
            for (const w of nodeDecl.writes) {
              if (memoryNames.has(w.memory)) {
                memoryLines += `
- Memory save: \`.graft/memory/${w.memory.toLowerCase()}.json\``;
              }
            }
            for (const ref of nodeDecl.reads) {
              if (memoryNames.has(ref.context)) continue;
              const producerNode = [...nodeMap.values()].find((n) => n.produces.name === ref.context);
              if (!producerNode || producerNode.name === step.name) continue;
              const edgeKey = `${producerNode.name}->${step.name}`;
              if (edgeMap.has(edgeKey)) continue;
              if (prevParallelBranches.includes(producerNode.name)) continue;
              if (prev === producerNode.name) continue;
              additionalInputs += `
- Also reads: \`.graft/session/node_outputs/${producerNode.name.toLowerCase()}.json\` (${ref.context})`;
            }
          }
          text += `
### Step ${stepNum}: ${step.name} [sequential]
- Agent: ${lowerName}${inputSource}${transformNote}${additionalInputs}${memoryLines}
- Expected tokens: input ~${nodeReport?.estimatedIn.toLocaleString("en-US") || "?"} / output ~${nodeReport?.estimatedOut.toLocaleString("en-US") || "?"}
- Completion: \`===NODE_COMPLETE:${lowerName}===\`
- Output: \`.graft/session/node_outputs/${lowerName}.json\`
`;
          stepNum++;
          const condEdge = conditionalEdgeMap.get(step.name);
          if (condEdge && condEdge.target.kind === "conditional") {
            text += generateConditionalRoutingStep(stepNum, condEdge, nodeMap, report);
            stepNum++;
          }
          prev = step.name;
          prevParallelBranches = [];
          break;
        }
        case "parallel": {
          const branchList = step.branches.join(", ");
          text += `
### Step ${stepNum}: [parallel] ${branchList}
- **Dispatch all ${step.branches.length} agents concurrently** using the Agent tool in a single message
- Wait for all to complete before proceeding
`;
          const incomingTransforms = [];
          for (const branchName of step.branches) {
            const lowerName = branchName.toLowerCase();
            const nodeReport = report.nodes.find((n) => n.name === branchName);
            let branchInputNote = "";
            if (prev) {
              const edgeInfo = edgeMap.get(`${prev}->${branchName}`);
              if (edgeInfo) {
                const transformedPath = `.graft/session/node_outputs/${prev.toLowerCase()}_to_${lowerName}.json`;
                branchInputNote = ` [input: \`${transformedPath}\`]`;
                incomingTransforms.push(`- **Edge transform** (${prev} \u2192 ${branchName}): ${describeTransforms(edgeInfo.transforms)}. Run: \`node .claude/hooks/${prev.toLowerCase()}-to-${lowerName}.js\` or manually apply. Output: \`${transformedPath}\``);
              } else {
                branchInputNote = ` [input: \`.graft/session/node_outputs/${prev.toLowerCase()}.json\`]`;
              }
            }
            let branchMemAnnotations = "";
            const branchDecl = nodeMap.get(branchName);
            if (branchDecl) {
              const memReads = branchDecl.reads.filter((r) => memoryNames.has(r.context));
              for (const mr of memReads) {
                branchMemAnnotations += ` [mem-read: ${mr.context.toLowerCase()}]`;
              }
              for (const w of branchDecl.writes) {
                if (memoryNames.has(w.memory)) {
                  branchMemAnnotations += ` [mem-write: ${w.memory.toLowerCase()}]`;
                }
              }
            }
            text += `- Agent: ${lowerName} -- tokens: input ~${nodeReport?.estimatedIn.toLocaleString("en-US") || "?"} / output ~${nodeReport?.estimatedOut.toLocaleString("en-US") || "?"}${branchInputNote}${branchMemAnnotations}
`;
          }
          if (incomingTransforms.length > 0) {
            text += incomingTransforms.join("\n") + "\n";
          }
          text += `- Completion: all ${step.branches.length} \`===NODE_COMPLETE===\` signals received
`;
          prevParallelBranches = [...step.branches];
          prev = null;
          stepNum++;
          break;
        }
        case "foreach": {
          text += `
### Step ${stepNum}: [foreach over ${step.source}.output.${step.field}, max ${step.maxIterations} iterations]
- For each \`${step.binding}\` in list:
`;
          let subLetter = "a";
          for (const bodyStep of step.body) {
            if (bodyStep.kind === "node") {
              text += `  - Sub-step ${stepNum}${subLetter}: ${bodyStep.name} [foreach-body]
`;
              subLetter = String.fromCharCode(subLetter.charCodeAt(0) + 1);
            }
          }
          text += `- Completion: all iterations done or list exhausted
`;
          prev = null;
          stepNum++;
          break;
        }
        case "let":
          text += `
### Step ${stepNum}: [data binding] let ${step.name}
- Bind: \`${step.name}\` = \`${formatExpr(step.value)}\`
`;
          stepNum++;
          break;
        case "graph_call":
          text += `
### Step ${stepNum}: [sub-pipeline] ${step.name}(${step.args.map((a) => `${a.name}: ${formatExpr(a.value)}`).join(", ")})
- Execute graph \`${step.name}\` with parameters
`;
          stepNum++;
          prev = null;
          break;
      }
    }
    return { text, nextStep: stepNum, lastNode: prev };
  }

  // scripts/playground-shims/node-module.js
  function createRequire() {
    return () => ({ version: "6.0.1" });
  }

  // src/version.ts
  var import_meta = {};
  var version;
  try {
    const require2 = createRequire(import_meta.url);
    const pkg = require2("../package.json");
    version = pkg.version;
  } catch {
    version = "0.0.0-unknown";
  }
  var VERSION = version;

  // src/codegen/settings.ts
  function findFirstNodeName(flow) {
    for (const step of flow) {
      switch (step.kind) {
        case "node":
          return step.name;
        case "parallel":
          return step.branches[0];
        case "foreach":
          return findFirstNodeName(step.body);
        case "let":
          break;
        case "graph_call":
          break;
      }
    }
    return void 0;
  }
  function generateSettings(program, sourceFile, index) {
    const idx = index ?? new ProgramIndex(program);
    const graph = program.graphs[0];
    const firstNodeName = graph ? findFirstNodeName(graph.flow) : void 0;
    const firstNodeModel = firstNodeName ? idx.nodeMap.get(firstNodeName)?.model : void 0;
    const defaultModel = firstNodeModel ? MODEL_MAP[firstNodeModel] || firstNodeModel : MODEL_MAP.sonnet;
    const overrides = {};
    for (const node of program.nodes) {
      const resolved = MODEL_MAP[node.model] || node.model;
      if (resolved !== defaultModel) {
        overrides[node.name.toLowerCase()] = resolved;
      }
    }
    const hookCommands = [];
    for (const edge of program.edges) {
      if (edge.target.kind === "conditional") {
        const source = edge.source.toLowerCase();
        hookCommands.push({
          type: "command",
          command: `node .claude/hooks/${source}-router.js`,
          if: `Write(.graft/session/node_outputs/${source}.json)`
        });
      } else if (edge.target.kind === "direct" && edge.transforms.length > 0) {
        const source = edge.source.toLowerCase();
        const target = edge.target.node.toLowerCase();
        hookCommands.push({
          type: "command",
          command: `node .claude/hooks/${source}-to-${target}.js`,
          if: `Write(.graft/session/node_outputs/${source}.json)`
        });
      }
    }
    const hookEntries = [];
    if (hookCommands.length > 0) {
      hookEntries.push({
        matcher: "Write",
        hooks: hookCommands
      });
    }
    return {
      model: defaultModel,
      permissions: {
        allow: ["Read", "Write", "Edit", "Bash", "Skill"]
      },
      graft: {
        version: VERSION,
        source: sourceFile,
        compiled_at: (/* @__PURE__ */ new Date()).toISOString(),
        budget: {
          total: graph?.budget || 0,
          warning_threshold: BUDGET_WARNING_THRESHOLD,
          critical_threshold: BUDGET_CRITICAL_THRESHOLD
        },
        model_routing: {
          default: defaultModel,
          overrides
        }
      },
      hooks: {
        PostToolUse: hookEntries
      }
    };
  }

  // src/codegen/claude-backend.ts
  var ClaudeCodeBackend = class {
    name = "claude";
    generateAgent(node, memoryNames, ctx) {
      const inputOverrides = /* @__PURE__ */ new Map();
      for (const edge of ctx.program.edges) {
        if (edge.target.kind === "direct" && edge.target.node === node.name) {
          const sourceNode = ctx.program.nodes.find((n) => n.name === edge.source);
          if (sourceNode) {
            const producesName = sourceNode.produces.name;
            if (edge.transforms.length > 0) {
              inputOverrides.set(producesName, `.graft/session/node_outputs/${edge.source.toLowerCase()}_to_${node.name.toLowerCase()}.json`);
            } else {
              inputOverrides.set(producesName, `.graft/session/node_outputs/${edge.source.toLowerCase()}.json`);
            }
          }
        } else if (edge.target.kind === "conditional") {
          const isTarget = edge.target.branches.some((b) => b.target === node.name);
          if (isTarget) {
            const sourceNode = ctx.program.nodes.find((n) => n.name === edge.source);
            if (sourceNode) {
              const producesName = sourceNode.produces.name;
              if (!inputOverrides.has(producesName)) {
                inputOverrides.set(producesName, `.graft/session/node_outputs/${edge.source.toLowerCase()}.json`);
              }
            }
          }
        }
      }
      for (const ref of node.reads) {
        if (inputOverrides.has(ref.context) || memoryNames.has(ref.context)) continue;
        const producerNode = ctx.program.nodes.find((n) => n.produces.name === ref.context);
        if (producerNode && producerNode.name !== node.name) {
          inputOverrides.set(ref.context, `.graft/session/node_outputs/${producerNode.name.toLowerCase()}.json`);
        }
      }
      return generateAgent(node, memoryNames, inputOverrides);
    }
    generateHook(edge, _ctx) {
      return generateHook(edge);
    }
    generateConditionalHook(edge, _ctx) {
      return generateConditionalHook(edge);
    }
    generateOrchestration(ctx) {
      return generateOrchestration(ctx.program, ctx.report);
    }
    generateSettings(ctx) {
      return generateSettings(ctx.program, ctx.sourceFile, ctx.index);
    }
  };

  // src/codegen/codegen.ts
  var defaultBackend = new ClaudeCodeBackend();
  function generate(program, report, sourceFile, index, backend) {
    const idx = index ?? new ProgramIndex(program);
    const be = backend ?? defaultBackend;
    const ctx = { program, report, index: idx, sourceFile };
    const files = [];
    const memoryNames = new Set(program.memories.map((m) => m.name));
    for (const node of program.nodes) {
      files.push({
        path: `.claude/agents/${node.name.toLowerCase()}.md`,
        content: be.generateAgent(node, memoryNames, ctx)
      });
    }
    for (const edge of program.edges) {
      if (edge.target.kind === "conditional") {
        const hook = be.generateConditionalHook?.(edge, ctx);
        if (hook) {
          files.push({
            path: `.claude/hooks/${edge.source.toLowerCase()}-router.js`,
            content: hook
          });
        }
      } else {
        const hook = be.generateHook(edge, ctx);
        if (hook && edge.target.kind === "direct") {
          const source = edge.source.toLowerCase();
          const target = edge.target.node.toLowerCase();
          files.push({
            path: `.claude/hooks/${source}-to-${target}.js`,
            content: hook
          });
        }
      }
    }
    files.push({
      path: ".claude/CLAUDE.md",
      content: be.generateOrchestration(ctx)
    });
    const settings = be.generateSettings(ctx);
    files.push({
      path: ".claude/settings.json",
      content: JSON.stringify(settings, null, 2)
    });
    files.push({ path: ".graft/session/node_outputs/.gitkeep", content: "" });
    files.push({ path: ".graft/token_log.txt", content: "" });
    const hasConditionalEdges = program.edges.some((e) => e.target.kind === "conditional");
    if (hasConditionalEdges) {
      files.push({ path: ".graft/session/routing/.gitkeep", content: "" });
    }
    if (program.memories.length > 0) {
      files.push({ path: ".graft/memory/.gitkeep", content: "" });
    }
    return files;
  }

  // src/playground-entry.ts
  function serializeDiagnostic(e, source, filename) {
    return {
      message: e.message,
      line: e.location.line,
      column: e.location.column,
      severity: e.severity,
      code: e.code,
      formatted: e.format(source, filename)
    };
  }
  function compilePlayground(source, filename = "playground.gft") {
    const errors = [];
    const warnings = [];
    let tokens;
    try {
      const lexer = new Lexer(source);
      tokens = lexer.tokenize();
    } catch (e) {
      if (e instanceof GraftError) {
        return {
          success: false,
          errors: [serializeDiagnostic(e, source, filename)],
          warnings: []
        };
      }
      throw e;
    }
    const { program, errors: parseErrors } = new Parser(tokens).parse();
    errors.push(...parseErrors);
    if (parseErrors.length > 0) {
      return {
        success: false,
        program,
        errors: errors.map((e) => serializeDiagnostic(e, source, filename)),
        warnings: []
      };
    }
    for (const c of program.contexts) c.sourceFile = filename;
    for (const n of program.nodes) n.sourceFile = filename;
    const index = new ProgramIndex(program);
    const scopeDiagnostics = new ScopeChecker(program, index).check();
    const typeDiagnostics = new TypeChecker(program, index).check();
    for (const d of [...scopeDiagnostics, ...typeDiagnostics]) {
      if (d.severity === "warning") warnings.push(d);
      else errors.push(d);
    }
    if (errors.length > 0) {
      return {
        success: false,
        program,
        errors: errors.map((e) => serializeDiagnostic(e, source, filename)),
        warnings: warnings.map((w) => serializeDiagnostic(w, source, filename))
      };
    }
    const report = new TokenEstimator(program, index).estimate();
    warnings.push(...report.warnings);
    let files;
    if (program.graphs.length > 0) {
      files = generate(program, report, filename, index);
    }
    return {
      success: true,
      program,
      report,
      files,
      errors: [],
      warnings: warnings.map((w) => serializeDiagnostic(w, source, filename))
    };
  }
  return __toCommonJS(playground_entry_exports);
})();
if(typeof window!=='undefined')window.Graft=GraftCompiler;
