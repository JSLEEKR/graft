# M1-4: End-to-End Demo Record

> Compiled 2026-04-03. Graft v5.0.0.

## Demo 1: hello.gft (2-node pipeline)

### Source
```graft
context UserRequest(max_tokens: 500) {
  question: String
}

node Researcher(model: sonnet, budget: 2k/1k) {
  reads: [UserRequest]
  produces Research {
    findings: List<String>
    confidence: Float(0..1)
  }
}

node Writer(model: haiku, budget: 1500/800) {
  reads: [Research.findings]
  produces Answer { response: String }
}

edge Researcher -> Writer | select(findings) | compact

graph SimpleQA(input: UserRequest, output: Answer, budget: 6k) {
  Researcher -> Writer -> done
}
```

### Compile
```
$ graft compile examples/hello.gft
✓ Parse OK
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Researcher           in ~   500  out ~ 1,000
    Writer               in ~    63  out ~   800
    Best path:     2,363 tokens ✓ within budget (6,000)
    Worst path:    2,363 tokens ✓ within budget (6,000)
```

### Generated Files
```
.claude/
├── agents/
│   ├── researcher.md    (706 bytes)
│   └── writer.md        (657 bytes)
├── hooks/
│   └── researcher-to-writer.sh
├── CLAUDE.md            (orchestration plan)
└── settings.json        (model routing + hooks)
.graft/
├── session/node_outputs/.gitkeep
└── token_log.txt
```

### Generated Agent: researcher.md
```yaml
---
name: researcher
description: Researcher agent — produces Research
model: claude-sonnet-4-20250514
---
```
- Reads: UserRequest from `.graft/session/`
- Output: JSON `{ findings: [...], confidence: 0 }`
- Completion: `===NODE_COMPLETE:researcher===`

### Generated Agent: writer.md
```yaml
---
name: writer
description: Writer agent — produces Answer
model: claude-haiku-4-5-20251001
---
```
- Reads: Research.findings from `.graft/session/`
- Output: JSON `{ response: "..." }`
- Completion: `===NODE_COMPLETE:writer===`

### settings.json (Claude Code compatible)
```json
{
  "model": "claude-sonnet-4-20250514",
  "permissions": { "allow": ["Read", "Write", "Edit", "Bash", "Skill"] },
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write(.graft/session/node_outputs/researcher.json)",
      "hooks": [{ "type": "command", "command": ".claude/hooks/researcher-to-writer.sh" }]
    }]
  }
}
```

### Hook: researcher-to-writer.sh
- Applies `select(findings)` + `compact` transforms via jq
- Reads `researcher.json`, writes `researcher_to_writer.json`
- Logs token reduction to `.graft/token_log.txt`

---

## Demo 2: chatbot.gft (imports + persistent memory)

### Source
```graft
import { UserMessage, SystemConfig } from "./shared.gft"

memory ConversationLog(max_tokens: 2k, storage: file) {
  turns: List<Turn { role: String  content: String }>
  summary: Optional<String>
}

node Responder(model: sonnet, budget: 4k/2k) {
  reads: [UserMessage, SystemConfig, ConversationLog]
  writes: [ConversationLog]
  produces Response {
    reply: String
    updated_turns: List<Turn { role: String  content: String }>
    summary: Optional<String>
  }
}

graph Chat(input: UserMessage, output: Response, budget: 8k) {
  Responder -> done
}
```

### Compile
```
$ cd examples && graft compile chatbot.gft
✓ Parse OK
✓ Scope check OK
✓ Type check OK
✓ Token analysis:
    Responder            in ~ 2,700  out ~ 2,000
    Best path:     4,700 tokens ✓ within budget (8,000)
    Worst path:    4,700 tokens ✓ within budget (8,000)
```

### Generated Files
```
.claude/
├── agents/
│   └── responder.md
├── CLAUDE.md
└── settings.json
.graft/
├── session/node_outputs/.gitkeep
├── memory/.gitkeep
└── token_log.txt
```

### Key Feature: Memory Integration
The responder agent reads from AND writes to persistent memory:
```
## Context Loading
- Load `UserMessage` from `.graft/session/`
- Load `SystemConfig` from `.graft/session/`
- Load `ConversationLog` from `.graft/memory/conversationlog.json`

## Memory Saving
After producing output, save to persistent memory:
- Save to `.graft/memory/conversationlog.json`
```

---

## Claude Code Compatibility Verified

| Feature | Status |
|---------|--------|
| Agent frontmatter: `name` | ✓ |
| Agent frontmatter: `description` | ✓ (added in M1-2) |
| Agent frontmatter: `model` | ✓ full model IDs |
| Agent frontmatter: `tools` | ✓ omitted when empty |
| settings.json: `model` | ✓ |
| settings.json: `permissions` | ✓ |
| settings.json: hook format | ✓ `{ matcher, hooks: [{ type, command }] }` |
| CLAUDE.md: orchestration | ✓ step-by-step execution plan |
| Hook scripts: jq transforms | ✓ select, drop, compact |
| Memory scaffold: `.graft/memory/` | ✓ |
