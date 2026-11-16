import { Check, Pencil, X } from "lucide-react";
import type { Candidate, CandidateEvidence } from "../../api/types";
import styles from "./Expansion.module.css";

interface Props {
  c: Candidate;
  selected: boolean;
  onToggle: () => void;
  onReject: () => void;
  onUndo: () => void;
  onRefine: () => void;
  onCite: (ev: CandidateEvidence) => void;
}

export function CandidateCard({ c, selected, onToggle, onReject, onUndo, onRefine, onCite }: Props) {
  if (c.status === "rejected") {
    return (
      <div className={styles.rejected}>
        <span>Option {c.label} rejected</span>
        <button onClick={onUndo}>Undo</button>
      </div>
    );
  }
  const accepted = c.status === "accepted";
  const state = accepted ? "accepted" : selected ? "selected" : "idle";

  return (
    <div
      className={styles.card}
      data-state={state}
      role="group"
      aria-label={`Option ${c.label}`}
      onClick={(e) => {
        if (accepted) return;
        if ((e.target as HTMLElement).closest("button, a")) return;
        onToggle();
      }}
    >
      <div className={styles.cHead}>
        <button
          className={styles.check} data-on={selected || accepted} aria-pressed={selected || accepted}
          aria-label={`Select option ${c.label}`} disabled={accepted} onClick={onToggle}
        >
          <Check size={12} strokeWidth={3.2} aria-hidden />
        </button>
        <span className={styles.optLabel}>Option {c.label}</span>
        <span className={styles.angle}>{c.angle}</span>
        <div className={styles.grow} />
        {accepted && <span className={styles.added}>Added to review</span>}
        <span className={styles.prob} title="Verbalized probability reported by the model">p ≈ {c.probability.toFixed(2)}</span>
        {!accepted && (
          <>
            <button className={styles.iconBtn} aria-label={`Refine option ${c.label}`} title="Refine in the composer" onClick={onRefine}><Pencil size={14} aria-hidden /></button>
            <button className={styles.iconBtn} aria-label={`Reject option ${c.label}`} title="Reject" onClick={onReject}><X size={14} strokeWidth={2.2} aria-hidden /></button>
          </>
        )}
      </div>
      <p className={styles.cText}>{c.text}</p>
      <div className={styles.cites}>
        <span className={styles.citeLbl}>Grounded in</span>
        {c.evidence.length === 0 && <span className={styles.citeLbl}>no citations</span>}
        {c.evidence.map((ev, i) =>
          ev.verified ? (
            <button key={i} className={styles.cite} title={`“${ev.quote}”`} onClick={() => onCite(ev)}>
              p. {ev.page} ↗
            </button>
          ) : (
            <span key={i} className={styles.citeBad} title="This quote could not be found in the paper." tabIndex={0}>
              unverified quote
            </span>
          ),
        )}
      </div>
    </div>
  );
}
