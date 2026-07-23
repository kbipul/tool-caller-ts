// Top-level orchestration: raw model text -> parsed call -> tool lookup ->
// argument validation -> verdict (valid | repairable | invalid) + repaired call.

import { extractToolCall } from "./parse";
import { validateArguments } from "./schema";
import { closest } from "./text";
import type { Finding, ToolCall, ToolDef, ValidationResult, Verdict } from "./types";

function decideVerdict(findings: Finding[], parseNotes: string[]): Verdict {
  const errors = findings.filter((f) => f.severity === "error");
  const unfixable = errors.filter((f) => !f.fix);
  if (unfixable.length > 0) return "invalid";
  if (errors.length > 0 || parseNotes.length > 0) return "repairable";
  return "valid";
}

/** Validate one raw tool-call string against a set of available tools. */
export function validateRaw(tools: ToolDef[], raw: string): ValidationResult {
  const { name, arguments: args, notes } = extractToolCall(raw);
  const parseNotes = notes;

  // Nothing recoverable from the text at all.
  if (name === null && args === undefined) {
    return {
      verdict: "invalid",
      call: null,
      parseNotes,
      findings: [
        {
          type: "unparseable",
          severity: "error",
          path: "",
          message: "could not recover a tool call from this output — no JSON object found",
        },
      ],
    };
  }

  const call: ToolCall = { name: name ?? "", arguments: args };
  const findings: Finding[] = [];
  let targetTool: ToolDef | undefined = tools.find((t) => t.name === name);
  let repairedName = call.name;
  let suggestion: string | undefined;

  if (!targetTool) {
    const near = name ? closest(name, tools.map((t) => t.name), 4) : null;
    const f: Finding = {
      type: "unknown_tool",
      severity: "error",
      path: "name",
      message: name ? `no tool named "${name}" is available` : "the call did not name a tool",
    };
    if (near) {
      suggestion = near.value;
      f.fix = { from: name, to: near.value, note: `did you mean "${near.value}"?` };
      repairedName = near.value;
      targetTool = tools.find((t) => t.name === near.value);
    }
    findings.push(f);
  }

  let repairedArgs: unknown = args;
  if (targetTool) {
    const check = validateArguments(targetTool.parameters, args);
    findings.push(...check.findings);
    repairedArgs = check.repaired;
  }

  let verdict = decideVerdict(findings, parseNotes);

  // Trust-but-verify: if we claim "repairable", the repaired call must actually
  // validate clean. Otherwise the repair is incomplete — downgrade to invalid.
  let repaired: ToolCall | undefined;
  if (verdict === "repairable" && targetTool) {
    const recheck = validateArguments(targetTool.parameters, repairedArgs);
    if (recheck.findings.some((f) => f.severity === "error")) {
      verdict = "invalid";
    } else {
      repaired = { name: repairedName, arguments: repairedArgs };
    }
  } else if (verdict === "repairable" && !targetTool) {
    verdict = "invalid";
  }

  return { verdict, call, findings, repaired, parseNotes, suggestion };
}
