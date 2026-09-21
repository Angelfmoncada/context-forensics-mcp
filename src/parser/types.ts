export interface Usage {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheCreate5m: number;
  readonly cacheCreate1h: number;
  readonly output: number;
  readonly thinking: number;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface ToolResult {
  readonly toolUseId: string;
  readonly bytes: number;
  readonly isBinary: boolean;
}

export interface AssistantTurn {
  readonly kind: 'assistant';
  readonly uuid: string;
  readonly timestamp: string;
  readonly isSidechain: boolean;
  readonly model: string;
  readonly usage: Usage;
  readonly toolCalls: readonly ToolCall[];
  readonly textChars: number;
}

export interface UserTurn {
  readonly kind: 'user';
  readonly uuid: string;
  readonly timestamp: string;
  readonly isSidechain: boolean;
  readonly toolResults: readonly ToolResult[];
  readonly promptChars: number;
}

export type Turn = AssistantTurn | UserTurn;

export interface Transcript {
  readonly path: string;
  readonly sessionId: string;
  readonly title: string | undefined;
  readonly turns: readonly Turn[];
  readonly parseWarnings: number;
}

export type ParsedLine =
  | { kind: 'turn'; turn: Turn }
  | { kind: 'title'; title: string }
  | { kind: 'skip' }
  | { kind: 'warning' };

export const ZERO_USAGE: Usage = { input: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0, output: 0, thinking: 0 };
