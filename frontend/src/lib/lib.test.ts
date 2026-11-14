import { describe, expect, it } from "vitest";
import type { Session, SessionSummary } from "../api/types";
import { findSpanRange } from "../components/pdf/match";
import { groupLabel, groupSummaries, summaryMeta } from "./grouping";
import { reviewToMarkdown, reviewWordCount } from "./markdown";

const now = new Date(2026, 10, 14, 15, 0, 0);
const daysAgo = (n: number) => new Date(2026, 10, 14 - n, 9, 0, 0).toISOString();

describe("history grouping", () => {
  it("buckets by updated_at", () => {
    expect(groupLabel(daysAgo(0), now)).toBe("Today");
    expect(groupLabel(daysAgo(1), now)).toBe("Yesterday");
    expect(groupLabel(daysAgo(5), now)).toBe("Previous 7 days");
    expect(groupLabel(daysAgo(20), now)).toBe("Previous 30 days");
    expect(groupLabel(daysAgo(90), now)).toBe("Older");
  });
  it("orders groups and omits empty ones", () => {
    const mk = (id: string, d: number): SessionSummary => ({ id, title: id, venue: "ARR", role: "reviewer", num_turns: 0, updated_at: daysAgo(d) });
    const g = groupSummaries([mk("a", 90), mk("b", 0), mk("c", 0)], now);
    expect(g.map((x) => x.label)).toEqual(["Today", "Older"]);
    expect(g[0].items.map((i) => i.id)).toEqual(["b", "c"]);
  });
  it("formats meta line", () => {
    const base = { id: "x", title: "t", venue: "ICLR", updated_at: "", num_turns: 4 } as const;
    expect(summaryMeta({ ...base, role: "reviewer" })).toBe("ICLR · 4 judgments");
    expect(summaryMeta({ ...base, role: "reviewer", num_turns: 1 })).toBe("ICLR · 1 judgment");
    expect(summaryMeta({ ...base, role: "author" })).toBe("ICLR · author mode");
  });
});

describe("findSpanRange", () => {
  const spans = ["We compare against", "temperature scaling,", "deep ensembles and", "MC dropout."];
  it("finds a range across spans", () => {
    expect(findSpanRange(spans, "temperature scaling, deep ensembles")).toEqual([1, 2]);
  });
  it("is case/whitespace insensitive", () => {
    expect(findSpanRange(spans, "  WE   compare against ")).toEqual([0, 0]);
  });
  it("re-joins hyphenated line breaks", () => {
    expect(findSpanRange(["the evalu-", "ation is small"], "the evaluation is small")).toEqual([0, 1]);
  });
  it("falls back to start/end anchors and returns null when absent", () => {
    const long = ["alpha beta gamma delta epsilon", "zeta eta theta iota kappa lambda", "mu nu xi omicron pi rho sigma"];
    expect(findSpanRange(long, "alpha beta gamma delta epsilon zeta eta theta CHANGED MIDDLE iota kappa lambda mu nu xi omicron pi rho sigma")).toEqual([0, 2]);
    expect(findSpanRange(spans, "nothing like this appears")).toBeNull();
  });
});

describe("markdown export", () => {
  const s = {
    title: "Paper", venue: "ARR", role: "reviewer",
    review: [{ id: "1", section: "weaknesses", text: "Missing baseline." }, { id: "2", section: "summary", text: "A good paper overall." }],
  } as unknown as Session;
  it("lists sections in order", () => {
    const md = reviewToMarkdown(s);
    expect(md.indexOf("## Summary")).toBeLessThan(md.indexOf("## Weaknesses"));
    expect(md).toContain("- Missing baseline.");
    expect(md).toContain("_No items yet._");
  });
  it("counts words", () => expect(reviewWordCount(s)).toBe(6));
});
