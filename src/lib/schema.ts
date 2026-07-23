// A small JSON-Schema validator + safe repairer for tool-call arguments.
// Only the subset that LLM tool definitions use is implemented (see types.ts).
// Every problem is reported as a Finding tagged with one FailureType; when a
// meaning-preserving repair exists, the Finding carries a Fix and the repaired
// value is applied to the returned `repaired` copy.

import { closest } from "./text";
import type { Finding, JsonSchema, JsonType } from "./types";

export interface ArgCheck {
  findings: Finding[];
  repaired: unknown; // best-effort repaired value (fixes applied where safe)
}

function typeOf(v: unknown): JsonType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string") return "string";
  return "object";
}

function matchesType(v: unknown, t: JsonType): boolean {
  const actual = typeOf(v);
  if (t === "number") return actual === "number" || actual === "integer";
  return actual === t;
}

function types(schema: JsonSchema): JsonType[] {
  if (!schema.type) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
}

/** Attempt an unambiguous coercion of `v` to one of the allowed types. */
function coerce(v: unknown, allowed: JsonType[]): { to: unknown; note: string } | null {
  const want = new Set(allowed);
  if (typeof v === "string") {
    const s = v.trim();
    if ((want.has("integer") || want.has("number")) && /^-?\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (want.has("integer") && !Number.isInteger(n)) return null;
      return { to: n, note: `string "${v}" → ${want.has("integer") ? "integer" : "number"} ${n}` };
    }
    if (want.has("boolean") && /^(true|false)$/i.test(s)) {
      return { to: s.toLowerCase() === "true", note: `string "${v}" → boolean ${s.toLowerCase()}` };
    }
  }
  if ((typeof v === "number" || typeof v === "boolean") && want.has("string")) {
    return { to: String(v), note: `${typeof v} ${v} → string "${v}"` };
  }
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** Validate a single value against a (sub)schema, returning findings + repair. */
function checkValue(schema: JsonSchema, value: unknown, path: string): ArgCheck {
  const findings: Finding[] = [];
  let repaired = value;

  // enum first — an out-of-set value is an enum_violation regardless of type.
  if (schema.enum) {
    const ok = schema.enum.some((e) => deepEqual(e, value));
    if (!ok) {
      const strEnum = schema.enum.filter((e): e is string => typeof e === "string");
      const near = typeof value === "string" ? closest(value, strEnum, 3) : null;
      const f: Finding = {
        type: "enum_violation",
        severity: "error",
        path,
        message: `${JSON.stringify(value)} is not one of [${schema.enum.map((e) => JSON.stringify(e)).join(", ")}]`,
      };
      if (near) {
        f.fix = { from: value, to: near.value, note: `did you mean "${near.value}"?` };
        repaired = near.value;
      }
      findings.push(f);
    }
    return { findings, repaired };
  }

  const allowed = types(schema);
  if (allowed.length && !allowed.some((t) => matchesType(value, t))) {
    const c = coerce(value, allowed);
    const f: Finding = {
      type: "wrong_type",
      severity: "error",
      path,
      message: `expected ${allowed.join(" | ")}, got ${typeOf(value)}`,
    };
    if (c) {
      f.fix = { from: value, to: c.to, note: c.note };
      repaired = c.to;
    }
    findings.push(f);
    // If we could not coerce, no point checking constraints on wrong type.
    if (!c) return { findings, repaired };
    value = c.to;
  }

  // Constraint checks (reported, never silently "fixed" — we can't guess intent).
  if (typeof repaired === "string") {
    if (schema.minLength !== undefined && repaired.length < schema.minLength) {
      findings.push(constraint(path, `string shorter than minLength ${schema.minLength}`));
    }
    if (schema.maxLength !== undefined && repaired.length > schema.maxLength) {
      findings.push(constraint(path, `string longer than maxLength ${schema.maxLength}`));
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(repaired)) {
      findings.push(constraint(path, `does not match pattern /${schema.pattern}/`));
    }
    if (schema.format && !matchesFormat(repaired, schema.format)) {
      findings.push({
        type: "constraint_violation",
        severity: "warning",
        path,
        message: `does not look like a ${schema.format}`,
      });
    }
  }
  if (typeof repaired === "number") {
    if (schema.minimum !== undefined && repaired < schema.minimum) {
      findings.push(constraint(path, `below minimum ${schema.minimum}`));
    }
    if (schema.maximum !== undefined && repaired > schema.maximum) {
      findings.push(constraint(path, `above maximum ${schema.maximum}`));
    }
  }

  // Recurse into arrays and nested objects.
  if (Array.isArray(repaired)) {
    if (schema.minItems !== undefined && repaired.length < schema.minItems) {
      findings.push(constraint(path, `fewer than minItems ${schema.minItems}`));
    }
    if (schema.maxItems !== undefined && repaired.length > schema.maxItems) {
      findings.push(constraint(path, `more than maxItems ${schema.maxItems}`));
    }
    if (schema.items) {
      const out = repaired.slice();
      repaired.forEach((item, i) => {
        const sub = checkValue(schema.items as JsonSchema, item, `${path}[${i}]`);
        findings.push(...sub.findings);
        out[i] = sub.repaired;
      });
      repaired = out;
    }
  } else if (repaired && typeof repaired === "object" && schema.properties) {
    const sub = checkObject(schema, repaired as Record<string, unknown>, path);
    findings.push(...sub.findings);
    repaired = sub.repaired;
  }

  return { findings, repaired };
}

function constraint(path: string, message: string): Finding {
  return { type: "constraint_violation", severity: "error", path, message };
}

function matchesFormat(v: string, format: string): boolean {
  switch (format) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v);
    case "date-time":
      return /^\d{4}-\d{2}-\d{2}T/.test(v);
    case "uri":
    case "url":
      return /^https?:\/\/\S+$/.test(v);
    default:
      return true; // unknown formats are advisory only
  }
}

/** Validate an object value against an object schema (properties/required). */
function checkObject(
  schema: JsonSchema,
  value: Record<string, unknown>,
  base: string,
): ArgCheck {
  const findings: Finding[] = [];
  const repaired: Record<string, unknown> = { ...value };
  const props = schema.properties ?? {};
  const additional = schema.additionalProperties !== false;

  // Missing required arguments.
  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      const child = props[key];
      const f: Finding = {
        type: "missing_required",
        severity: "error",
        path: join(base, key),
        message: `required argument "${key}" is missing`,
      };
      if (child && "default" in child) {
        f.fix = { from: undefined, to: child.default, note: `filled schema default ${JSON.stringify(child.default)}` };
        repaired[key] = child.default;
      }
      findings.push(f);
    }
  }

  // Unexpected / known arguments.
  for (const key of Object.keys(value)) {
    if (!(key in props)) {
      if (!additional) {
        findings.push({
          type: "unexpected_arg",
          severity: "error",
          path: join(base, key),
          message: `argument "${key}" is not allowed by the schema`,
          fix: { from: value[key], to: undefined, note: `dropped unexpected argument "${key}"` },
        });
        delete repaired[key];
      }
      continue;
    }
    const sub = checkValue(props[key], value[key], join(base, key));
    findings.push(...sub.findings);
    repaired[key] = sub.repaired;
  }

  return { findings, repaired };
}

function join(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

/**
 * Validate a tool call's arguments object against the tool's parameter schema.
 */
export function validateArguments(schema: JsonSchema, args: unknown): ArgCheck {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return {
      findings: [
        {
          type: "wrong_type",
          severity: "error",
          path: "arguments",
          message: `arguments must be an object, got ${typeOf(args)}`,
        },
      ],
      repaired: args,
    };
  }
  return checkObject(schema, args as Record<string, unknown>, "");
}
