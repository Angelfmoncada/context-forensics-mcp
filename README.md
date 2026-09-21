# context-forensics-mcp

**Forensic analysis of Claude Code sessions: where your tokens went, what it cost, and where to compact.**

An MCP server that reads the JSONL transcripts Claude Code already writes to `~/.claude/projects/` and answers with exact numbers — no estimates where the transcript already recorded the truth, no API keys, no network.

```
Session baf896a6 — 13 MB transcript, analyzed in 95 ms
Turns:   527 assistant / 338 user / 0 sidechain
Models:  claude-fable-5-1 ×527
Tokens:  input 15,052 | cache read 213,344,398 | cache write 5m 0 / 1h 3,341,571 | output 2,604,644 (thinking 799,980)
Cost:    $250.5503 (pricing 2026-09-20)
Peak:    628,101 tokens at turn 863 (62.8% of window)
Top hogs:
  Read: ~1,229,048 tokens, 19 call(s), 96.3%
  Bash: ~29,437 tokens, 126 call(s), 2.3%
  mcp__plugin_playwright_playwright__browser_snapshot: ~4,968 tokens, 6 call(s), 0.4%
Findings:
  [high] Read result ~158223 tokens at turn 500 — file .../report-full.png
  [high] Read result ~129573 tokens at turn 471 — file .../decision-dialog.png
  [high] Read result ~118104 tokens at turn 509 — file .../evidence-sheet.png
```

That session spent **$53 on cache reads alone** and 96% of its tool output was 19 PNG screenshots read as base64. You would never see that from inside the session.

## Why

Every agent session has a context window that fills up, a bill that grows, and tools that quietly return more than they should. Claude Code records all of it — model, usage buckets, cache hits, every tool call and result — but nothing reads it back. This server does, and hands the result to the agent itself, so it can inspect its own sessions and adjust.

## Install

Requires Node 20+.

**Claude Code**

```bash
claude mcp add context-forensics -- npx -y context-forensics-mcp
```

**Claude Desktop / Cursor / any MCP client** — add to your MCP config:

```json
{
  "mcpServers": {
    "context-forensics": {
      "command": "npx",
      "args": ["-y", "context-forensics-mcp"]
    }
  }
}
```

Then ask: *"Analyze my latest session"*, *"What ate the context in session abc123?"*, *"How much did the `my-app` project cost this month?"*

**CLI** (no MCP client needed)

```bash
npx -p context-forensics-mcp context-forensics report latest
npx -p context-forensics-mcp context-forensics list my-project
```

## Tools

Every tool returns `{ ok: true, summary, data }` or `{ ok: false, error, hint }`. `summary` is one line for humans; `data` is compact JSON for the agent.

| Tool | Input | What you get |
|---|---|---|
| `list_sessions` | `project?`, `since?`, `limit?` | Sessions newest first: id, project, dates, turn count, models, title. Start here to find a session id. |
| `analyze_session` | `session` | Everything at once: turns, models, exact token buckets, USD cost, peak context and % of window, top 3 hogs, top 3 findings. |
| `rank_token_hogs` | `session`, `by?` (`tool` / `file` / `mcp_server`), `top?` | What filled the context, ranked. Bytes are exact; tokens ≈ bytes/4. |
| `estimate_cost` | `session` **or** `project` + `since?` / `until?` | USD by model and by bucket: input, cache read, 5m cache write, 1h cache write, output. Project mode aggregates every matching session. |
| `diff_context_growth` | `session`, `minDelta?` | Turn-by-turn context size, the delta, **the tool result that caused each jump**, and the turns where 80% / 90% of the window were crossed. |
| `suggest_compaction` | `session` | Findings with evidence and estimated savings (see below). |

`session` accepts a session id (uuid), an absolute `.jsonl` path inside the allowed roots, or `"latest"`.

### Compaction heuristics

| Kind | Fires when | Severity |
|---|---|---|
| `oversized_result` | One tool result over ~20k tokens | high |
| `window_pressure` | Context crossed 80% of the model's window | high |
| `repeated_read` | Same file read 3+ times (savings = every read after the first) | medium / high |
| `binary_in_context` | Images or base64 blobs in tool results | medium |
| `noisy_bash` | 5+ Bash results over ~5k tokens each | medium |
| `thinking_heavy` | Thinking tokens > 5× visible output across the session | low |

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `CONTEXT_FORENSICS_ROOTS` | `~/.claude/projects` | Directories the server may read, separated by `:` (Unix) or `;` (Windows). Paths outside are refused, symlinks are resolved first. |
| `CONTEXT_FORENSICS_PRICING` | bundled table | Path to a JSON file merged over the bundled prices. Partial entries are fine. |

Pricing override example — bump one price and add a new model:

```json
{
  "asOf": "2026-12-01",
  "models": {
    "claude-sonnet-5": { "input": 3, "output": 15 },
    "claude-new-model": { "input": 4, "cacheRead": 0.4, "cacheWrite5m": 5, "cacheWrite1h": 8, "output": 20, "contextWindow": 1000000 }
  }
}
```

## Accuracy

- **Exact:** every token count in `tokens`, `cost` and `diff_context_growth` comes straight from the `usage` block Claude Code recorded per turn — input, cache read, cache creation split by 5-minute / 1-hour TTL, output, thinking.
- **Approximate:** per-tool and per-file sizes are measured in bytes of the serialized result and converted at 4 bytes/token. They are labelled `approxTokens` everywhere. For images this overstates real image tokens (base64 is large, image tokens are not).
- **Pricing:** bundled from [Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing), dated in `pricingAsOf`. Unknown models get `cost: null` for that model and are listed in `unknownModels` — never guessed.
- Context size at a turn = `input + cacheRead + cacheCreate5m + cacheCreate1h`. Sidechain (subagent) turns are counted but excluded from the growth timeline.

## Privacy

Read-only. No network calls, no writes, no telemetry, no `child_process`. The only files it opens are `.jsonl` transcripts under the allowed roots. Nothing leaves your machine.

## Development

```bash
npm install
npm test               # vitest, 59 tests
npm run test:coverage  # thresholds: 80% lines / 70% branches
npm run typecheck
npm run build
npm run dev            # run the stdio server from source
```

`tests/fixtures/real-anonymized.jsonl` is a real transcript with every string replaced by same-length filler and every path hashed (`scripts/anonymize.ts`). Structure and usage numbers are untouched, which is what the parser and cost tests need.

Layout: `src/parser` (streaming JSONL → typed turns) → `src/analysis` (pure functions) → `src/server` (MCP tools with Zod schemas). `src/discovery` finds and gates transcript files; `src/pricing` owns the price table.

## License

MIT
