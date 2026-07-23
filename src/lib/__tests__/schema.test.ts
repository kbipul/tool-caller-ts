import { describe, it, expect } from "vitest";
import { validateArguments } from "../schema";
import type { JsonSchema } from "../types";

const flight: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["origin", "passengers", "cabin"],
  properties: {
    origin: { type: "string" },
    passengers: { type: "integer", minimum: 1, maximum: 9 },
    cabin: { type: "string", enum: ["economy", "business", "first"] },
    note: { type: "string", default: "n/a" },
  },
};

describe("validateArguments", () => {
  it("passes a clean object with no findings", () => {
    const r = validateArguments(flight, { origin: "SFO", passengers: 2, cabin: "business" });
    expect(r.findings).toHaveLength(0);
  });

  it("flags a missing required argument", () => {
    const r = validateArguments(flight, { origin: "SFO", cabin: "business" });
    const f = r.findings.find((x) => x.type === "missing_required");
    expect(f?.path).toBe("passengers");
    expect(f?.fix).toBeUndefined(); // no default -> unfixable
  });

  it("fills a default for a missing required arg that has one", () => {
    const s: JsonSchema = { type: "object", required: ["note"], properties: { note: { type: "string", default: "n/a" } } };
    const r = validateArguments(s, {});
    const f = r.findings.find((x) => x.type === "missing_required");
    expect(f?.fix?.to).toBe("n/a");
    expect((r.repaired as Record<string, unknown>).note).toBe("n/a");
  });

  it("coerces a numeric string to an integer", () => {
    const r = validateArguments(flight, { origin: "SFO", passengers: "3", cabin: "economy" });
    const f = r.findings.find((x) => x.type === "wrong_type");
    expect(f?.fix?.to).toBe(3);
    expect((r.repaired as Record<string, unknown>).passengers).toBe(3);
  });

  it("does not coerce a non-numeric string", () => {
    const r = validateArguments(flight, { origin: "SFO", passengers: "lots", cabin: "economy" });
    const f = r.findings.find((x) => x.type === "wrong_type");
    expect(f?.fix).toBeUndefined();
  });

  it("suggests the nearest enum value", () => {
    const r = validateArguments(flight, { origin: "SFO", passengers: 1, cabin: "buisness" });
    const f = r.findings.find((x) => x.type === "enum_violation");
    expect(f?.fix?.to).toBe("business");
  });

  it("drops an argument the schema forbids", () => {
    const r = validateArguments(flight, { origin: "SFO", passengers: 1, cabin: "first", hacker: true });
    const f = r.findings.find((x) => x.type === "unexpected_arg");
    expect(f?.path).toBe("hacker");
    expect("hacker" in (r.repaired as object)).toBe(false);
  });

  it("reports an out-of-range number without inventing a fix", () => {
    const r = validateArguments(flight, { origin: "SFO", passengers: 42, cabin: "first" });
    const f = r.findings.find((x) => x.type === "constraint_violation");
    expect(f?.message).toMatch(/maximum/);
    expect(f?.fix).toBeUndefined();
  });

  it("rejects non-object arguments", () => {
    const r = validateArguments(flight, [1, 2, 3]);
    expect(r.findings[0].type).toBe("wrong_type");
    expect(r.findings[0].path).toBe("arguments");
  });

  it("validates array item formats", () => {
    const s: JsonSchema = {
      type: "object",
      properties: { cc: { type: "array", items: { type: "string", format: "email" } } },
    };
    const r = validateArguments(s, { cc: ["good@x.com", "nope"] });
    const warn = r.findings.find((x) => x.severity === "warning");
    expect(warn?.path).toBe("cc[1]");
  });
});
