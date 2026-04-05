---
name: responder
description: Responder agent — produces Response
model: claude-sonnet-4-20250514
---

# Responder Agent

## Context Loading
- Load `UserMessage` from `.graft/session/`
- Load `SystemConfig` from `.graft/session/`
- Load `ConversationLog` from `.graft/memory/conversationlog.json`

## Memory Saving
After producing output, save to persistent memory:
- Save to `.graft/memory/conversationlog.json`

## Output Contract
Produce JSON output matching this schema:
```json
{
  "reply": "<string>",
  "updated_turns": [
    {
      "role": "<string>",
      "content": "<string>"
    }
  ],
  "summary": "<string>"
}
```

## Token Discipline
- Input budget: 4000 tokens. Read only what is necessary.
- Output budget: 2000 tokens. No explanations, no reasoning traces.
- Output ONLY the JSON result.

## Completion Protocol
1. Write result to `.graft/session/node_outputs/responder.json`
2. Output: `===NODE_COMPLETE:responder===`

## Failure Protocol
On failure, output: `===NODE_FAILED:responder===`