# context-forensics-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only MCP server that analyzes Claude Code JSONL transcripts and reports exact token usage, cost, tool-level attribution, context growth and compaction opportunities.

**Architecture:** Streaming JSONL parser produces immutable `Turn` records; pure analysis functions compute reports from `Transcript`; a thin MCP layer validates inputs with Zod and wraps results in a `{ok,data,summary}` envelope. Discovery restricts file access to allowed roots.

**Tech Stack:** Node 22, TypeScript 5 (NodeNext ESM), `@modelcontextprotocol/server` 2.0.0, `@modelcontextprotocol/client` 2.0.0 (tests), `zod` 4.6, `vitest` 5 + `@vitest/coverage-v8`.

**Spec:** `docs/superpowers/specs/2026-09-20-context-forensics-mcp-design.md`

## Global Constraints

- Package name `context-forensics-mcp`, license MIT, `"type": "module"`, bin `context-forensics-mcp`.
- Node `>=20`. ESM imports use explicit `.js` extensions.
- No `child_process`, no `fetch`, no filesystem writes anywhere in `src/`.
- Immutability: never mutate inputs; build new objects/arrays.
- Functions < 50 lines, files < 400 lines.
- Every tool input validated by Zod; every tool returns `{ ok: true, data, summary }` or `{ ok: false, error, hint }`.
- Approximate tokens = `Math.round(bytes / 4)`, always labelled `approxTokens`.
- Context size at an assistant turn = `usage.input + usage.cacheRead + usage.cacheCreate5m + usage.cacheCreate1h`.
- Allowed roots default `~/.claude/projects`; env `CONTEXT_FORENSICS_ROOTS` (split on `path.delimiter`) overrides.
- Pricing override env `CONTEXT_FORENSICS_PRICING=<json path>` merges over bundled table.
- Coverage ≥ 80%.

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .gitignore, LICENSE, README.md
src/
  parser/types.ts            Turn, Usage, ToolCall, ToolResult, Transcript, ZERO_USAGE
  parser/parseLine.ts        parseLine(raw): ParsedLine   (pure)
  parser/parseTranscript.ts  parseTranscript(path): Promise<Transcript>  (streaming)
  pricing/models.json        bundled price table (asOf 2026-09-20)
  pricing/pricing.ts         loadPricing(overridePath?), lookupModel(pricing, id)
  discovery/roots.ts         getRoots(env), isInsideRoots(realPath, roots), expandHome
  discovery/resolveSession.ts findTranscripts(roots), resolveSession(ref, roots)
  discovery/listSessions.ts  listSessions(roots, filter)
  analysis/attribution.ts    attributeResults(t), approxTokens, mcpServerOf
  analysis/cost.ts           computeCost(t, pricing), mergeCostReports, addCost, ZERO_COST
  analysis/hogs.ts           rankHogs(t, by, top)
  analysis/growth.ts         contextGrowth(t, minDelta, pricing), contextSize, windowFor
  analysis/compaction.ts     suggestCompaction(t, pricing)
  analysis/summarize.ts      summarize(t, pricing)
  server/respond.ts          ok(), fail(), failFrom()
  server/context.ts          ServerContext, SESSION_REF_DESC
  server/tools/listSessions.ts, analyzeSession.ts, rankTokenHogs.ts,
               estimateCost.ts, diffContextGrowth.ts, suggestCompaction.ts
  server/createServer.ts     createServer(ctx): McpServer
  index.ts                   stdio entry (bin)
  cli.ts                     `report <ref>` / `list` human output
scripts/anonymize.ts         structure-only fixture from a real transcript
tests/
  helpers/lines.ts           assistantLine(), userLine(), titleLine(), toolUse(), toolResult()
  helpers/tmpRoot.ts         mkTmpRoot() temp roots dir with sessions
  helpers/tx.ts              tx(lines): Transcript
  parser/parseLine.test.ts, parser/parseTranscript.test.ts, parser/realFixture.test.ts
  pricing/pricing.test.ts
  discovery/roots.test.ts, resolveSession.test.ts, listSessions.test.ts
  analysis/attribution.test.ts, cost.test.ts, hogs.test.ts, growth.test.ts, compaction.test.ts, summarize.test.ts
  server/tools.test.ts       integration over InMemoryTransport, every tool
  fixtures/real-anonymized.jsonl
```

---

### Task 1: Project scaffold

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`.

- [ ] **Step 1: package.json** — name `context-forensics-mcp`, version `0.1.0`, `"type":"module"`, bins `context-forensics-mcp → dist/index.js` and `context-forensics → dist/cli.js`, `files: [dist, README.md, LICENSE]`, engines node >=20. Scripts: `build` = `tsc -p tsconfig.json` then copy `src/pricing/models.json` to `dist/pricing/`; `typecheck` = `tsc --noEmit`; `test` = `vitest run`; `test:coverage` = `vitest run --coverage`; `prepublishOnly` = typecheck + test + build. Deps: `@modelcontextprotocol/server ^2.0.0`, `zod ^4.6.5`. Dev: `@modelcontextprotocol/client ^2.0.0`, `@types/node ^22`, `@vitest/coverage-v8 ^5.0.1`, `tsx ^4.19`, `typescript ^5.6`, `vitest ^5.0.1`.
- [ ] **Step 2: tsconfig.json** — target ES2022, module/moduleResolution NodeNext, outDir dist, rootDir src, strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, resolveJsonModule, skipLibCheck, include [src].
- [ ] **Step 3: vitest.config.ts** — include `tests/**/*.test.ts`; coverage v8 over `src/**/*.ts` excluding `src/index.ts`, `src/cli.ts`; thresholds lines/functions/statements 80, branches 70.
- [ ] **Step 4: .gitignore** (`node_modules/ dist/ coverage/ *.log .DS_Store`) + MIT LICENSE (holder "Angel Moncada", 2026).
- [ ] **Step 5:** `npm install`, `git init -b main`, commit `chore: scaffold context-forensics-mcp`.

---

### Task 2: Parser types + parseLine

**Files:** `src/parser/types.ts`, `src/parser/parseLine.ts`, `tests/helpers/lines.ts`, `tests/parser/parseLine.test.ts`.

**Produces:**
```ts
export interface Usage { readonly input: number; readonly cacheRead: number; readonly cacheCreate5m: number; readonly cacheCreate1h: number; readonly output: number; readonly thinking: number }
export interface ToolCall { readonly id: string; readonly name: string; readonly input: Readonly<Record<string, unknown>> }
export interface ToolResult { readonly toolUseId: string; readonly bytes: number; readonly isBinary: boolean }
export interface AssistantTurn { readonly kind: 'assistant'; readonly uuid: string; readonly timestamp: string; readonly isSidechain: boolean; readonly model: string; readonly usage: Usage; readonly toolCalls: readonly ToolCall[]; readonly textChars: number }
export interface UserTurn { readonly kind: 'user'; readonly uuid: string; readonly timestamp: string; readonly isSidechain: boolean; readonly toolResults: readonly ToolResult[]; readonly promptChars: number }
export type Turn = AssistantTurn | UserTurn
export interface Transcript { readonly path: string; readonly sessionId: string; readonly title: string | undefined; readonly turns: readonly Turn[]; readonly parseWarnings: number }
export type ParsedLine = { kind: 'turn'; turn: Turn } | { kind: 'title'; title: string } | { kind: 'skip' } | { kind: 'warning' }
export const ZERO_USAGE: Usage
export function parseLine(raw: string): ParsedLine
```

Rules: `cache_creation.ephemeral_5m/1h` split; if the `cache_creation` sub-object is missing, all of `cache_creation_input_tokens` counts as 5m. `thinking` from `output_tokens_details.thinking_tokens`. Tool result `bytes` = UTF-8 length of `JSON.stringify(content)`. `isBinary` when any content block is `type:'image'` or has `source.type:'base64'`. Assistant line without `message.usage` → `warning`. Blank → `skip`. Non-JSON → `warning`. `ai-title` → `title`. Other types → `skip`.

- [ ] Step 1: write helpers (`assistantLine({uuid,ts,model,usage:{input,cacheRead,c5m,c1h,output,thinking},content,sidechain})`, `userLine({uuid,ts,content,sidechain})`, `titleLine(t)`, `toolUse(id,name,input)`, `toolResult(id,content)`) producing real-format JSON lines.
- [ ] Step 2: failing tests: usage incl. cache split + thinking; fallback when `cache_creation` missing; tool_result bytes (`'x'.repeat(400)` → 402 bytes) + binary flag; plain string prompt chars; title; skip; malformed → warning; assistant without usage → warning.
- [ ] Step 3: run → FAIL. Step 4: implement. Step 5: PASS, commit `feat(parser): parseLine with usage, tool calls and tool results`.

---

### Task 3: parseTranscript (streaming)

**Files:** `src/parser/parseTranscript.ts`, `tests/helpers/tmpRoot.ts`, `tests/parser/parseTranscript.test.ts`.

**Produces:** `parseTranscript(path: string): Promise<Transcript>` — readline over `createReadStream`, `sessionId = basename(path, '.jsonl')`, missing file throws `Transcript not found: <path>`.

- [ ] Step 1: `mkTmpRoot(sessions: {project,id,lines,mtime?}[]): string` writing `<root>/<project>/<id>.jsonl` and applying mtime.
- [ ] Step 2: failing tests: title + turn kinds + warning count on `[title, user, assistant, '{bad', '']`; missing file rejects.
- [ ] Step 3–5: FAIL → implement → PASS → commit `feat(parser): streaming parseTranscript`.

---

### Task 4: Pricing

**Files:** `src/pricing/models.json`, `src/pricing/pricing.ts`, `tests/pricing/pricing.test.ts`.

**Produces:**
```ts
export interface ModelPrice { input; cacheRead; cacheWrite5m; cacheWrite1h; output; contextWindow }   // USD per MTok, window in tokens
export interface Pricing { asOf: string; models: Record<string, ModelPrice> }
export function loadPricing(overridePath?: string): Promise<Pricing>   // Zod-validated; override merges per-model partials over bundled; invalid → throws /pricing/i
export function lookupModel(p: Pricing, id: string): ModelPrice | null // exact, else longest key that is a prefix of id
```

Bundled table (platform.claude.com/docs/en/about-claude/pricing, 2026-09-20). Window: 1M for 4.6+, 200k for ≤4.5.

| id | input | 5m | 1h | read | out | window |
|---|---|---|---|---|---|---|
| claude-fable-5-1 | 10 | 12.5 | 20 | 0.25 | 50 | 1000000 |
| claude-fable-5 | 10 | 12.5 | 20 | 1 | 50 | 1000000 |
| claude-opus-5 / 4-8 / 4-7 / 4-6 | 5 | 6.25 | 10 | 0.5 | 25 | 1000000 |
| claude-opus-4-5 | 5 | 6.25 | 10 | 0.5 | 25 | 200000 |
| claude-sonnet-5 | 2 | 2.5 | 4 | 0.2 | 10 | 1000000 |
| claude-sonnet-4-6 | 3 | 3.75 | 6 | 0.3 | 15 | 1000000 |
| claude-sonnet-4-5 | 3 | 3.75 | 6 | 0.3 | 15 | 200000 |
| claude-haiku-4-5 | 1 | 1.25 | 2 | 0.1 | 5 | 200000 |

- [ ] Tests: bundled loads; prefix (`claude-sonnet-5-20260401` → 2; `claude-fable-5-1` → 0.25; `claude-fable-5-20260101` → 1); unknown → null; override merge keeps other models; invalid override rejects.
- [ ] Implement, PASS, commit `feat(pricing): bundled Anthropic price table with override`.

---

### Task 5: Discovery

**Files:** `src/discovery/roots.ts`, `resolveSession.ts`, `listSessions.ts` + 3 tests.

**Produces:**
```ts
getRoots(env): readonly string[]            // default ~/.claude/projects; CONTEXT_FORENSICS_ROOTS split on path.delimiter, ~ expanded
isInsideRoots(realPath, roots): boolean     // sep-aware prefix check; case-insensitive on win32
findTranscripts(roots): Promise<readonly {path,project,id,mtimeMs,sizeBytes}[]>   // <root>/<project>/<id>.jsonl, one level
resolveSession(ref, roots): Promise<string> // 'latest' → newest mtime; absolute or *.jsonl → realpath + inside-roots check ('Path outside allowed roots: …'); else id lookup ('Session not found: …')
interface SessionInfo { id; project; path; startedAt: string|null; endedAt: string|null; turns; models: string[]; title; sizeBytes }
listSessions(roots, {project?, since?, limit?=20}): Promise<readonly SessionInfo[]> // filter+sort by mtime desc, slice, THEN parse only those
```

- [ ] Tests: default root; env split + `~`; sibling-prefix escape rejected; latest/id/path resolution; outside-roots rejection; unknown id; listSessions metadata + project/since/limit filters.
- [ ] Implement, PASS, commit `feat(discovery): roots, resolveSession, listSessions`.

---

### Task 6: Attribution + cost

**Files:** `src/analysis/attribution.ts`, `src/analysis/cost.ts`, `tests/helpers/tx.ts`, tests.

**Produces:**
```ts
interface AttributedResult { turnIndex; tool; toolUseId; bytes; approxTokens; isBinary; filePath: string|undefined; mcpServer: string|undefined }
approxTokens(bytes) = Math.round(bytes/4); mcpServerOf('mcp__srv__x') = 'srv'
attributeResults(t): readonly AttributedResult[]   // tool_use.id → tool_result.tool_use_id; orphan → tool 'unknown'; filePath from input.file_path
interface CostBreakdown { input; cacheRead; cacheCreate5m; cacheCreate1h; output; total }  // USD, rounded 1e-6
interface CostReport { currency:'USD'; pricingAsOf; byModel: Record<string,CostBreakdown>; total; unknownModels: string[] }
ZERO_COST; addCost(a,b); computeCost(t, pricing); mergeCostReports(reports, asOf)
```

- [ ] Tests: linkage incl. mcp server + filePath; orphan; approxTokens; 1M tokens of each bucket on opus-5 → `{5, 0.5, 6.25, 10, 25, total 46.75}`; unknown model listed and excluded; merge.
- [ ] Implement, PASS, commit `feat(analysis): tool attribution and exact cost computation`.

---

### Task 7: hogs, growth, compaction, summarize

**Files:** `src/analysis/hogs.ts`, `growth.ts`, `compaction.ts`, `summarize.ts` + tests.

**Produces:**
```ts
type HogBy = 'tool'|'file'|'mcp_server'
interface HogRow { key; calls; bytes; approxTokens; pctOfToolBytes /* 1 decimal, of ALL tool-result bytes */ }
rankHogs(t, by, top): readonly HogRow[]     // sorted bytes desc; 'file' only rows with filePath; 'mcp_server' only mcp tools

contextSize(u) = input+cacheRead+cacheCreate5m+cacheCreate1h
windowFor(t, pricing): number|null          // window of first assistant model
interface GrowthPoint { turnIndex; timestamp; contextTokens; delta; pctOfWindow: number|null; cause?: {tool, approxTokens, filePath} }
interface GrowthReport { windowTokens: number|null; peak: {turnIndex, contextTokens}; timeline: GrowthPoint[]; crossed80At?: number; crossed90At?: number }
contextGrowth(t, minDelta, pricing)         // non-sidechain assistant turns; cause = largest tool result strictly between previous and this assistant turn; timeline keeps first, peak, and |delta|>=minDelta

type FindingKind = 'repeated_read'|'oversized_result'|'binary_in_context'|'thinking_heavy'|'window_pressure'|'noisy_bash'
interface Finding { kind; severity:'high'|'medium'|'low'; title; evidence; estSavingsTokens }
suggestCompaction(t, pricing): readonly Finding[]   // sorted severity high→low then savings desc
  repeated_read: Read same file_path ≥3× (savings = total − first); oversized_result: single result >20k approx tokens (high);
  binary_in_context: any isBinary (medium); thinking_heavy: Σthinking > 5×Σ(output−thinking) (low, savings 0);
  window_pressure: crossed80At defined (high, savings = peak − 50% window); noisy_bash: ≥5 Bash results >5k tokens (medium)

interface Summary { id; path; title; startedAt; endedAt; durationMs: number|null; turns:{assistant,user,sidechain}; models: Record<string,number>; tokens: Usage; cost: CostReport; peakContext:{tokens, turnIndex, pctOfWindow}; topHogs: HogRow[3]; topFindings: Finding[3]; parseWarnings }
summarize(t, pricing): Summary
```

- [ ] Tests per function as described (hogs by tool/file/mcp_server/top; growth timeline with causes, peak, 80/90 crossings using a pricing stub with window 100k; each compaction heuristic in isolation + clean session → `[]`; summarize aggregates).
- [ ] Implement, PASS, commit `feat(analysis): hogs, context growth, compaction findings, summary`.

---

### Task 8: MCP server + tools + integration test

**Files:** `src/server/respond.ts`, `context.ts`, `tools/*.ts` (6), `createServer.ts`, `src/index.ts`, `tests/server/tools.test.ts`.

**Produces:**
```ts
ok(data, summary) → { content:[{type:'text', text: JSON({ok:true, summary, data})}] }
fail(error, hint) → { content:[…JSON({ok:false, error, hint})], isError:true }
failFrom(e)       → fail(msg, hint) — hint suggests list_sessions/"latest" when msg matches /Session not found|outside allowed roots/
interface ServerContext { roots: readonly string[]; pricing: Pricing }
createServer(ctx): McpServer   // name 'context-forensics-mcp', registers 6 tools
```

Tool contracts (Zod, all optional fields `.optional()`):
- `list_sessions { project?, since?, limit? (1..200) }`
- `analyze_session { session }`
- `rank_token_hogs { session, by? ('tool'|'file'|'mcp_server'), top? (1..100) }`
- `estimate_cost { session?, project?, since?, until? }` — exactly one of session/project else `fail`; project mode aggregates via `listSessions(limit 200)` filtered by `until` and `mergeCostReports`, data includes `sessions: n`.
- `diff_context_growth { session, minDelta? (default 2000) }`
- `suggest_compaction { session }`

`src/index.ts`: `#!/usr/bin/env node`, loads pricing (env override), `getRoots(process.env)`, connects `StdioServerTransport` from `@modelcontextprotocol/server/stdio`; startup error → stderr + exit 1.

- [ ] Integration test: `InMemoryTransport.createLinkedPair()` from `@modelcontextprotocol/server`, `Client` from `@modelcontextprotocol/client`; asserts 6 tool names; each tool ok path; estimate_cost validation; unknown session → `ok:false` + `/Session not found/`.
- [ ] `npm run typecheck && npm run test:coverage` ≥ 80%; commit `feat(server): MCP server with six forensic tools`.

---

### Task 9: CLI + anonymized real fixture

**Files:** `src/cli.ts`, `scripts/anonymize.ts`, `tests/fixtures/real-anonymized.jsonl`, `tests/parser/realFixture.test.ts`.

- [ ] `cli.ts`: `report [<ref>|latest]` prints session/turns/models/tokens/cost/peak/top hogs/findings; `list` prints 20 newest. Errors → stderr, exit 1.
- [ ] `scripts/anonymize.ts <in> <out>`: keep keys `type,role,model,name,id,tool_use_id,uuid,parentUuid,timestamp,isSidechain,stop_reason,service_tier,speed,inference_geo` and all numbers; drop `cwd,gitBranch,sessionId,requestId,promptId,toolUseResult,snapshot,diagnostics`; `file_path`/`path` → `/f/<sha1-8><ext>`; every other string → `'x'.repeat(len)`.
- [ ] Generate fixture from a 1–3 MB real transcript; verify `grep -c "Users" fixture` = 0.
- [ ] `realFixture.test.ts`: turns > 50, parseWarnings 0, cost > 0, `unknown` tool share < 5%.
- [ ] PASS, commit `feat(cli): human report + anonymized real fixture`.

---

### Task 10: README, review, publish

- [ ] README: what/why with real `report` output; install `npx -y context-forensics-mcp`; `claude mcp add context-forensics -- npx -y context-forensics-mcp`; Claude Desktop + Cursor JSON; tool reference table; env vars with override example; accuracy notes (exact vs approx, pricing date); privacy (read-only, offline); development; MIT.
- [ ] code-reviewer + security-reviewer agents; fix CRITICAL/HIGH.
- [ ] `npm run typecheck && npm run test:coverage && npm run build`; smoke `node dist/cli.js report latest`; `claude mcp add` + verify tool call from Claude Code.
- [ ] User: `gh auth login`. Then `gh repo create context-forensics-mcp --public --source=. --push`.
- [ ] `npm publish` after user's `npm login`.

---

## Self-review

- Spec coverage: §2 → T2/T3; §3 → T2–T8; §4 six tools → T8; §5 → T4; §6 → T5 + failFrom; §7 → all + T9; §8 → T10. ✔
- Types: `Usage` field names identical across parser/cost/summarize; `AttributedResult` shared by hogs/growth/compaction; `contextWindow` consumed by growth. ✔
- No placeholders. ✔
