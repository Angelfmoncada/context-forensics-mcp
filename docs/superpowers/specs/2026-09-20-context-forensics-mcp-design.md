# context-forensics-mcp — Design Spec

**Date:** 2026-09-20
**Status:** Approved
**Runtime:** TypeScript / Node 22, `@modelcontextprotocol/sdk`, stdio transport
**Package:** `context-forensics-mcp` (npm, verified free 2026-09-20)
**License:** MIT

## 1. Purpose

A read-only MCP server that performs forensic analysis of Claude Code session transcripts
(`~/.claude/projects/**/*.jsonl`). It answers, with exact numbers taken from the transcript's own
`usage` records: where tokens went, what a session cost, which tools return the most bytes, when
the context window grew, and where compaction would help.

Non-goals for v1: other harnesses (Codex, OpenCode), live/streaming analysis, any network I/O,
any writes to disk, any telemetry.

## 2. Input format (verified against real transcripts on 2026-09-20)

Each line is a JSON object with a `type`. Relevant types:

| type | relevant fields |
|---|---|
| `assistant` | `uuid`, `parentUuid`, `timestamp`, `isSidechain`, `message.model`, `message.usage`, `message.content[]` (blocks: `text`, `thinking`, `tool_use{id,name,input}`) |
| `user` | `uuid`, `parentUuid`, `timestamp`, `isSidechain`, `message.content` (string, or blocks incl. `tool_result{tool_use_id,content}`), `toolUseResult` |
| `ai-title` | `aiTitle` |
| `last-prompt`, `queue-operation`, `attachment`, `file-history-snapshot`, `atis-latch` | ignored |

`message.usage` on assistant turns:

```
input_tokens, output_tokens,
cache_read_input_tokens, cache_creation_input_tokens,
cache_creation.ephemeral_5m_input_tokens, cache_creation.ephemeral_1h_input_tokens,
output_tokens_details.thinking_tokens
```

Context size at a turn = `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.

Tool result attribution: `tool_use.id` on an assistant turn maps to `tool_result.tool_use_id` on the
following user turn. Result size is measured as UTF-8 bytes of the serialized `content`; approximate
tokens = bytes / 4 (labelled as approximate everywhere it appears).

Malformed lines are counted and reported in `parseWarnings`, never fatal.

## 3. Architecture

```
src/
  discovery/    findRoots(), listSessions(filter), resolveSession(ref)  — ref = uuid | path | "latest"
  parser/       parseTranscript(path): AsyncIterable<Turn> (streaming, readline)
                types.ts: Turn, AssistantTurn, UserTurn, Usage, ToolCall, ToolResult
  analysis/     pure functions over Turn[]:
                  summarize(), rankHogs(by), computeCost(pricing), contextGrowth(), suggestCompaction()
  pricing/      models.json (bundled, dated) + loadPricing(overridePath?)
  server/       McpServer registration; one file per tool; Zod input schemas
  cli.ts        `context-forensics-mcp report <ref>` / `list`  (human-readable)
  index.ts      bin entry: stdio server
```

Rules: functions < 50 lines, files < 400 lines, no mutation (return new objects), every boundary
validated with Zod, every error explicit.

## 4. Tools

All tools return `{ ok: true, data, summary }` or `{ ok: false, error, hint }`.
`summary` is a short human-readable string; `data` is compact JSON.

### `list_sessions`
Input: `{ project?: string, since?: ISO date, limit?: number (default 20) }`
Output rows: `{ id, project, path, startedAt, endedAt, turns, models[], title?, sizeBytes }`
Sorted by `endedAt` desc.

### `analyze_session`
Input: `{ session: string }`
Output: `{ id, project, title, startedAt, endedAt, durationMs, turns: {assistant,user,sidechain},
models: {model: turns}, tokens: {input, cacheRead, cacheCreate5m, cacheCreate1h, output, thinking},
cost: CostBreakdown | null, peakContext: {tokens, turnIndex, pctOfWindow|null},
topHogs: HogRow[3], topFindings: Finding[3], parseWarnings }`

### `rank_token_hogs`
Input: `{ session: string, by: "tool" | "file" | "mcp_server" (default "tool"), top?: number (default 10) }`
- `tool`: group by tool name.
- `file`: group `Read`/`Write`/`Edit` results by `input.file_path`.
- `mcp_server`: group `mcp__<server>__*` tools by server.
Output rows: `{ key, calls, bytes, approxTokens, pctOfToolBytes }`

### `estimate_cost`
Input: `{ session?: string, project?: string, since?: ISO, until?: ISO }` — exactly one of session/project.
Output: `{ currency: "USD", pricingAsOf, byModel: {model: CostBreakdown}, total: CostBreakdown,
unknownModels: string[] }`
CostBreakdown = `{ input, cacheRead, cacheCreate5m, cacheCreate1h, output, total }` (USD numbers).

### `diff_context_growth`
Input: `{ session: string, minDelta?: number (default 2000) }`
Output: `{ windowTokens|null, timeline: [{ turnIndex, timestamp, contextTokens, delta, pctOfWindow|null,
cause?: { tool, approxTokens, filePath? } }], crossed80At?: turnIndex, crossed90At?: turnIndex }`
Only turns with `|delta| >= minDelta` are listed; first and peak always included.

### `suggest_compaction`
Input: `{ session: string }`
Output: `Finding[]` where Finding = `{ kind, severity: "high"|"medium"|"low", title, evidence, estSavingsTokens }`
Heuristics v1:
1. `repeated_read` — same file_path read ≥3 times.
2. `oversized_result` — a single tool_result > 20k approx tokens.
3. `binary_in_context` — base64 / image blocks in results.
4. `thinking_heavy` — turns where thinking > 5× visible output, aggregated.
5. `window_pressure` — context crossed 80% of the model window; reports the turn.
6. `noisy_bash` — Bash results > 5k tokens, ≥5 times.

## 5. Pricing

`pricing/models.json`: `{ asOf, models: { [id]: { input, cacheRead, cacheWrite5m, cacheWrite1h, output, contextWindow } } }`
per-million-token USD. Verified against Anthropic docs at implementation time.
Override: env `CONTEXT_FORENSICS_PRICING=<path>` merges over bundled table.
Unknown model → cost `null` for that model, listed in `unknownModels`, never guessed.
Model id matching: exact, then prefix match on the family (e.g. `claude-opus-4-7` → `claude-opus-4-7`).

## 6. Security / errors

- Allowed roots: `~/.claude/projects` by default; env `CONTEXT_FORENSICS_ROOTS` (path-separator list) overrides.
  Any resolved session path outside the roots → `{ok:false, error:"path outside allowed roots"}`.
- Path refs are resolved with `realpath` before the root check (no symlink escape).
- No `child_process`, no `fetch`, no writes.
- Empty/missing file → clear error with hint to call `list_sessions`.

## 7. Testing

Vitest. Fixtures under `tests/fixtures/`: hand-written minimal JSONLs per scenario plus one
structure-only anonymized slice of a real transcript (content strings replaced by `"x".repeat(n)`,
preserving lengths and usage). Coverage target ≥ 80%. Integration test spins the server over stdio
with the SDK client and calls every tool.

## 8. Publishing

- Repo: `C:\Users\angel\Downloads\context-forensics-mcp`, public on GitHub via `gh repo create`.
- README: one-line install (`npx -y context-forensics-mcp`), config snippets for Claude Code /
  Claude Desktop / Cursor, real example outputs, tool reference, pricing override, roots override.
- `npm publish` prepared (`prepublishOnly: build + test`); requires user's `npm login`.
