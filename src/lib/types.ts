// Core types for the tool-call validator.
// A deliberately small subset of JSON Schema — the part LLM function/tool
// definitions actually use (OpenAI/Anthropic "parameters" objects).

export type JsonType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

export interface JsonSchema {
  type?: JsonType | JsonType[];
  description?: string;
  // object
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  // array
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  // enum / const
  enum?: unknown[];
  // string constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string; // advisory only (email, date, uri…)
  // number constraints
  minimum?: number;
  maximum?: number;
  // default used by repair to fill a missing required field
  default?: unknown;
}

export interface ToolDef {
  name: string;
  description?: string;
  parameters: JsonSchema;
}

/** A single tool/function call as emitted by a model. */
export interface ToolCall {
  name: string;
  arguments: unknown;
}

/**
 * The recurring tool-use failure taxonomy (after ToolCritic / ToolFailBench,
 * 2026). Every finding maps to exactly one of these so the UI can group them.
 */
export type FailureType =
  | "unparseable" // output was not valid JSON we could recover a call from
  | "unknown_tool" // hallucinated / misspelled tool name
  | "missing_required" // a required argument was absent
  | "unexpected_arg" // extra argument the schema does not allow
  | "wrong_type" // argument present but wrong JSON type
  | "enum_violation" // value not in the allowed set
  | "constraint_violation"; // range / length / pattern / items bound broken

export interface Fix {
  from: unknown;
  to: unknown;
  note: string;
}

export interface Finding {
  type: FailureType;
  severity: "error" | "warning";
  path: string; // e.g. "arguments.passengers" or "" for the call itself
  message: string;
  fix?: Fix; // present when a safe, meaning-preserving repair exists
}

export type Verdict = "valid" | "repairable" | "invalid";

export interface ValidationResult {
  verdict: Verdict;
  /** The normalized call we validated (after extraction from raw text). */
  call: ToolCall | null;
  findings: Finding[];
  /** A repaired call, when every error had a safe fix. */
  repaired?: ToolCall;
  /** Lenient-parse notes: what we had to fix just to read the JSON. */
  parseNotes: string[];
  /** Closest known tool name when the call named an unknown tool. */
  suggestion?: string;
}
