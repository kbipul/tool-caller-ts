import { describe, it, expect } from "vitest";
import { validateRaw } from "../validate";
import { TOOLS, SCENARIOS } from "../../data/tools";

function byId(id: string): string {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error("missing scenario " + id);
  return s.raw;
}

describe("validateRaw — verdicts", () => {
  it("marks a clean call valid", () => {
    const r = validateRaw(TOOLS, byId("clean"));
    expect(r.verdict).toBe("valid");
    expect(r.repaired).toBeUndefined();
  });

  it("repairs the messy flights call to a clean one", () => {
    const r = validateRaw(TOOLS, byId("flights-messy"));
    expect(r.verdict).toBe("repairable");
    const args = r.repaired?.arguments as Record<string, unknown>;
    expect(args.passengers).toBe(2);
    expect(args.cabin).toBe("business");
  });

  it("repairs a misspelled tool name", () => {
    const r = validateRaw(TOOLS, byId("name-typo"));
    expect(r.verdict).toBe("repairable");
    expect(r.repaired?.name).toBe("search_flights");
    expect(r.suggestion).toBe("search_flights");
  });

  it("handles the OpenAI stringified-args shape", () => {
    const r = validateRaw(TOOLS, byId("openai-stringified"));
    expect(r.verdict).toBe("repairable");
    const args = r.repaired?.arguments as Record<string, unknown>;
    expect(args.zone).toBe("living_room");
    expect(args.temperature_c).toBe(22);
  });

  it("repairs Python-flavoured JSON and drops a forbidden arg", () => {
    const r = validateRaw(TOOLS, byId("single-quotes"));
    expect(r.verdict).toBe("repairable");
    const args = r.repaired?.arguments as Record<string, unknown>;
    expect(args.symbol).toBe("MSFT");
    expect("exchange" in args).toBe(false);
  });

  it("calls a missing-required case invalid", () => {
    const r = validateRaw(TOOLS, byId("missing-required"));
    expect(r.verdict).toBe("invalid");
    expect(r.repaired).toBeUndefined();
    expect(r.findings.some((f) => f.type === "missing_required")).toBe(true);
  });

  it("calls an out-of-range case invalid", () => {
    const r = validateRaw(TOOLS, byId("out-of-range"));
    expect(r.verdict).toBe("invalid");
    expect(r.findings.some((f) => f.type === "constraint_violation")).toBe(true);
  });

  it("reports an unrecoverable output as invalid + unparseable", () => {
    const r = validateRaw(TOOLS, "the weather looks nice today");
    expect(r.verdict).toBe("invalid");
    expect(r.call).toBeNull();
    expect(r.findings[0].type).toBe("unparseable");
  });

  it("flags a truly unknown tool with no close match", () => {
    const r = validateRaw(TOOLS, '{"name":"launch_missiles","arguments":{}}');
    expect(r.verdict).toBe("invalid");
    expect(r.findings.some((f) => f.type === "unknown_tool")).toBe(true);
  });

  it("every repairable result actually re-validates clean", () => {
    for (const s of SCENARIOS) {
      const r = validateRaw(TOOLS, s.raw);
      if (r.verdict === "repairable" && r.repaired) {
        const again = validateRaw(TOOLS, JSON.stringify(r.repaired));
        expect(again.verdict, `re-check of ${s.id}`).toBe("valid");
      }
    }
  });
});
