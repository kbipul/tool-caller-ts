import { describe, it, expect } from "vitest";
import { looseParse, extractToolCall } from "../parse";

describe("looseParse", () => {
  it("parses clean JSON with no notes", () => {
    const r = looseParse('{"a":1}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1 });
    expect(r.notes).toEqual([]);
  });

  it("extracts JSON from a code fence and surrounding prose", () => {
    const r = looseParse('Sure!\n```json\n{"a": 1}\n```');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1 });
    expect(r.notes.join(" ")).toMatch(/code fence/);
  });

  it("removes trailing commas", () => {
    const r = looseParse('{"a": 1, "b": 2,}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1, b: 2 });
    expect(r.notes.join(" ")).toMatch(/trailing comma/);
  });

  it("quotes unquoted keys", () => {
    const r = looseParse("{ a: 1, b: 2 }");
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: 1, b: 2 });
  });

  it("converts Python literals", () => {
    const r = looseParse('{"a": True, "b": False, "c": None}');
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: true, b: false, c: null });
  });

  it("converts single quotes as a last resort", () => {
    const r = looseParse("{ 'a': 'x', 'b': 2 }");
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ a: "x", b: 2 });
    expect(r.notes.join(" ")).toMatch(/single quotes/);
  });

  it("fails cleanly on hopeless input", () => {
    const r = looseParse("this is not json at all");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("extractToolCall", () => {
  it("reads a bare {name, arguments}", () => {
    const c = extractToolCall('{"name":"foo","arguments":{"x":1}}');
    expect(c.name).toBe("foo");
    expect(c.arguments).toEqual({ x: 1 });
  });

  it("unwraps OpenAI tool_calls with stringified arguments", () => {
    const raw =
      '{"tool_calls":[{"type":"function","function":{"name":"foo","arguments":"{\\"x\\": 1}"}}]}';
    const c = extractToolCall(raw);
    expect(c.name).toBe("foo");
    expect(c.arguments).toEqual({ x: 1 });
  });

  it("reads Anthropic-style {name, input}", () => {
    const c = extractToolCall('{"name":"foo","input":{"x":1}}');
    expect(c.name).toBe("foo");
    expect(c.arguments).toEqual({ x: 1 });
  });

  it("defaults missing arguments to an empty object", () => {
    const c = extractToolCall('{"name":"foo"}');
    expect(c.arguments).toEqual({});
  });

  it("returns null name when unparseable", () => {
    const c = extractToolCall("nope");
    expect(c.name).toBeNull();
    expect(c.arguments).toBeUndefined();
  });
});
