// Tolerant extraction of a tool call from raw model output.
//
// Models rarely hand you clean JSON: they wrap it in prose, fence it in
// ```json blocks, leave trailing commas, use single quotes, emit Python
// literals (True/None), or stringify the arguments object. This module
// recovers a structured call and records every lenient fix it had to apply,
// so the UI can show "we could only read this after repairing the JSON".

export interface LooseParse {
  ok: boolean;
  value?: unknown;
  notes: string[];
  error?: string;
}

/** Find the first balanced {...} or [...] block, respecting string literals. */
function firstJsonBlock(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      quote = ch;
    } else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Strip a leading/trailing ```json ... ``` (or plain ```) fence if present. */
function stripFence(text: string): string {
  const fence = text.match(/```(?:json|js|ts)?\s*([\s\S]*?)```/i);
  return fence ? fence[1] : text;
}

/**
 * Best-effort JSON parse. Returns the parsed value plus a list of the lenient
 * transforms that were needed (empty when the input was already clean JSON).
 */
export function looseParse(raw: string): LooseParse {
  const notes: string[] = [];
  const trimmed = raw.trim();

  // 1. Already valid?
  try {
    return { ok: true, value: JSON.parse(trimmed), notes };
  } catch {
    /* fall through */
  }

  // 2. Peel a code fence and/or surrounding prose.
  let candidate = stripFence(trimmed).trim();
  if (candidate !== trimmed) notes.push("removed a Markdown code fence");
  const block = firstJsonBlock(candidate);
  if (block && block !== candidate) {
    notes.push("extracted the JSON object from surrounding text");
    candidate = block;
  } else if (block) {
    candidate = block;
  }
  try {
    return { ok: true, value: JSON.parse(candidate), notes };
  } catch {
    /* keep repairing */
  }

  // 3. Apply lenient repairs, one at a time, re-parsing after each.
  const repairs: Array<[RegExp | ((s: string) => string), string]> = [
    [(s) => s.replace(/\bTrue\b/g, "true").replace(/\bFalse\b/g, "false").replace(/\bNone\b/g, "null"), "converted Python literals (True/False/None)"],
    [/,(\s*[}\]])/g, "removed trailing commas"],
    [/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, "quoted unquoted object keys"],
  ];
  for (const [rule, note] of repairs) {
    const next =
      typeof rule === "function"
        ? rule(candidate)
        : candidate.replace(rule as RegExp, note === "quoted unquoted object keys" ? '$1"$2"$3' : "$1");
    if (next !== candidate) {
      candidate = next;
      notes.push(note);
      try {
        return { ok: true, value: JSON.parse(candidate), notes };
      } catch {
        /* keep going */
      }
    }
  }

  // 4. Last resort: single quotes acting as string delimiters.
  if (candidate.includes("'")) {
    const next = candidate.replace(/'/g, '"');
    try {
      const value = JSON.parse(next);
      notes.push("converted single quotes to double quotes (best effort)");
      return { ok: true, value, notes };
    } catch {
      /* give up */
    }
  }

  return { ok: false, notes, error: "could not recover valid JSON" };
}

export interface ExtractedCall {
  name: string | null;
  arguments: unknown;
  notes: string[];
}

const NAME_KEYS = ["name", "tool", "tool_name", "function", "function_name"];
const ARG_KEYS = ["arguments", "parameters", "params", "input", "args"];

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (k in obj) return obj[k];
  return undefined;
}

/**
 * Normalize the many shapes a tool call arrives in (OpenAI tool_calls,
 * Anthropic tool_use {name,input}, a bare {name,arguments}, or a stringified
 * arguments blob) into a single { name, arguments } pair.
 */
export function extractToolCall(raw: string): ExtractedCall {
  const parsed = looseParse(raw);
  const notes = [...parsed.notes];
  if (!parsed.ok) return { name: null, arguments: undefined, notes };

  let node = parsed.value as unknown;

  // Unwrap OpenAI's tool_calls array or a bare array of calls.
  if (node && typeof node === "object" && !Array.isArray(node) && "tool_calls" in (node as object)) {
    const tc = (node as Record<string, unknown>).tool_calls;
    if (Array.isArray(tc) && tc.length > 0) node = tc[0];
    notes.push("unwrapped tool_calls[0]");
  }
  if (Array.isArray(node) && node.length > 0) node = node[0];

  if (!node || typeof node !== "object") {
    return { name: null, arguments: node, notes };
  }
  let rec = node as Record<string, unknown>;

  // OpenAI: { type:"function", function:{ name, arguments } }
  if (rec.function && typeof rec.function === "object") {
    rec = rec.function as Record<string, unknown>;
  }

  const nameVal = pick(rec, NAME_KEYS);
  const name = typeof nameVal === "string" ? nameVal : null;

  let args = pick(rec, ARG_KEYS);
  // OpenAI stringifies the arguments object — parse it too.
  if (typeof args === "string") {
    const inner = looseParse(args);
    if (inner.ok) {
      args = inner.value;
      if (inner.notes.length) notes.push("parsed stringified arguments");
    }
  }
  if (args === undefined) args = {};

  return { name, arguments: args, notes };
}
