import type { Session } from "../api/types";
import { SECTIONS, SECTION_PLURAL } from "./sections";

export function reviewToMarkdown(s: Session): string {
  const parts = [`# Review: ${s.title}`, `*${s.venue} · ${s.role === "author" ? "author self-review" : "reviewer"}*`];
  for (const sec of SECTIONS) {
    const items = s.review.filter((i) => i.section === sec);
    parts.push(`## ${SECTION_PLURAL[sec]}`);
    parts.push(items.length ? items.map((i) => `- ${i.text.trim()}`).join("\n") : "_No items yet._");
  }
  return parts.join("\n\n") + "\n";
}

export function reviewWordCount(s: Session): number {
  return s.review.reduce((n, i) => n + (i.text.trim() ? i.text.trim().split(/\s+/).length : 0), 0);
}
