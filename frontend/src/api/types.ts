// Mirrors backend/app/models.py
export type Verbosity = "concise" | "balanced" | "detailed";
export type Section = "summary" | "strengths" | "weaknesses" | "questions";
export type Role = "reviewer" | "author";

export interface GenerationParams {
  verbosity: Verbosity;
  num_candidates: number;
  temperature: number;
  max_tokens: number | null;
}
export interface DocumentMeta { id: string; filename: string; num_pages: number; uploaded_at: string }
export interface EvidenceRef { id: string; kind: "evidence" | "snippet"; text: string; page: number }
export interface CandidateEvidence { quote: string; page: number | null; verified: boolean }
export type CandidateStatus = "pending" | "selected" | "rejected" | "accepted";
export interface Candidate {
  id: string; label: string; angle: string; text: string; probability: number;
  evidence: CandidateEvidence[]; status: CandidateStatus;
}
export interface Turn {
  id: string; judgment: string; section: Section; attachments: EvidenceRef[];
  params: GenerationParams; provider_id: string; model: string; candidates: Candidate[]; created_at: string;
}
export interface ReviewItem {
  id: string; section: Section; text: string;
  source_turn_id: string | null; source_candidate_id: string | null; source_page?: number | null;
}
export interface Session {
  id: string; title: string; document: DocumentMeta; venue: string; role: Role;
  turns: Turn[]; review: ReviewItem[]; created_at: string; updated_at: string;
}
export interface SessionSummary {
  id: string; title: string; venue: string; role: Role; num_turns: number; updated_at: string;
}
export interface ProviderInfo {
  id: string; name: string; available: boolean; models: string[]; default_model: string; is_default?: boolean;
}
export interface ExpandRequest {
  judgment: string; section: Section; attachments: EvidenceRef[];
  provider_id: string; model?: string | null; params: GenerationParams;
}
export interface DecisionRequest {
  selected_ids?: string[]; rejected_ids?: string[]; reset_ids?: string[]; add_to_review?: boolean;
}
