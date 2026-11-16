import type { SessionSummary } from "../api/types";

export const GROUP_ORDER = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"] as const;
export type GroupLabel = (typeof GROUP_ORDER)[number];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

export function groupLabel(updatedAt: string, now: Date = new Date()): GroupLabel {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(updatedAt))) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  if (days <= 30) return "Previous 30 days";
  return "Older";
}

export function groupSummaries(items: SessionSummary[], now: Date = new Date()) {
  const map = new Map<GroupLabel, SessionSummary[]>();
  for (const it of items) {
    const l = groupLabel(it.updated_at, now);
    map.set(l, [...(map.get(l) ?? []), it]);
  }
  return GROUP_ORDER.filter((l) => map.has(l)).map((label) => ({ label, items: map.get(label)! }));
}

export function summaryMeta(s: SessionSummary): string {
  if (s.role === "author") return `${s.venue} · author mode`;
  if (s.num_turns === 0) return `${s.venue} · draft`;
  return `${s.venue} · ${s.num_turns} judgment${s.num_turns === 1 ? "" : "s"}`;
}
