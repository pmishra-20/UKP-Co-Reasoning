import type { Section } from "../api/types";

export const SECTIONS: Section[] = ["summary", "strengths", "weaknesses", "questions"];
export const SECTION_PLURAL: Record<Section, string> = {
  summary: "Summary", strengths: "Strengths", weaknesses: "Weaknesses", questions: "Questions",
};
export const SECTION_SINGULAR: Record<Section, string> = {
  summary: "Summary", strengths: "Strength", weaknesses: "Weakness", questions: "Question",
};
