import { describe, it, expect } from "vitest";
import { levenshtein, closest } from "../text";

describe("levenshtein", () => {
  it("is zero for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("counts single edits", () => {
    expect(levenshtein("business", "buisness")).toBe(2);
    expect(levenshtein("cat", "cot")).toBe(1);
  });
  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("closest", () => {
  it("finds a near candidate within the gate", () => {
    const r = closest("buisness", ["economy", "business", "first"]);
    expect(r?.value).toBe("business");
  });
  it("refuses a far candidate", () => {
    const r = closest("xyz", ["economy", "business"]);
    expect(r).toBeNull();
  });
  it("does not repair an unrelated short token", () => {
    // "cat" vs "economy" is far beyond the length-based gate
    expect(closest("cat", ["economy"])).toBeNull();
  });
});
