import { useEffect, useRef, useState } from "react";
import type { Turn } from "../../api/types";
import { SECTION_PLURAL, SECTION_SINGULAR } from "../../lib/sections";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore } from "../../store/uiStore";
import { CandidateCard } from "./CandidateCard";
import { JudgmentBubble } from "./JudgmentBubble";
import { VerificationNote } from "./VerificationNote";
import styles from "./Expansion.module.css";

function Skeletons({ n }: { n: number }) {
  return (
    <div className={styles.cards} aria-busy="true" aria-label="Generating candidates">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={styles.skel}>
          <span style={{ width: "30%" }} /><span style={{ width: "100%" }} /><span style={{ width: "92%" }} /><span style={{ width: "55%" }} />
        </div>
      ))}
    </div>
  );
}

export function ExpansionPanel() {
  const { current: session, expanding, pendingJudgment, expandError, lastRequest, decide, expand } = useSessionStore();
  const scrollToPage = useUiStore((s) => s.scrollToPage);
  const setComposerText = useUiStore((s) => s.setComposerText);
  const focusComposer = useUiStore((s) => s.focusComposer);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);
  const turnCount = session?.turns.length ?? 0;

  // Bring a freshly generated (or loading/failed) turn into view in the panel.
  useEffect(() => {
    if (turnCount > 0 || expanding) endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [turnCount, expanding, expandError]);

  if (!session) return null;
  const turns = session.turns;
  const last = turns[turns.length - 1];
  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const rerun = (t: Turn) =>
    void expand({ judgment: t.judgment, section: t.section, attachments: t.attachments, provider_id: t.provider_id, model: t.model, params: t.params });

  const header = last ? `${SECTION_SINGULAR[last.section]} · ${last.candidates.length} candidates` : "";

  return (
    <div className={styles.panel}>
      <div className={styles.pHead}>
        <span className={styles.dot} aria-hidden />
        <span className={styles.cap}>Judgment expansion</span>
        <div className={styles.grow} />
        <span className={styles.meta}>{header}</span>
      </div>

      {turns.length === 0 && !expanding && !expandError && (
        <p className={styles.empty}>
          Write a judgment below, for example “The experimental evaluation is a weakness.” You will get several candidate
          expansions, each grounded in the paper.
        </p>
      )}

      {turns.map((t) => {
        const isLast = t === last && !expanding;
        const open = isLast || opened.has(t.id);
        if (!open) {
          const accepted = t.candidates.filter((c) => c.status === "accepted").length;
          return (
            <button key={t.id} className={styles.collapsed} onClick={() => setOpened((o) => new Set(o).add(t.id))} aria-expanded={false}>
              <span className={styles.cJudgment}>{t.judgment}</span>
              <span className={styles.meta}>
                {SECTION_SINGULAR[t.section]} · {t.candidates.length} candidates · {accepted} accepted
              </span>
            </button>
          );
        }
        const pending = t.candidates.filter((c) => c.status !== "rejected" && c.status !== "accepted");
        const picked = pending.filter((c) => selected.has(c.id));
        return (
          <div key={t.id} className={styles.turn}>
            <JudgmentBubble judgment={t.judgment} attachments={t.attachments} />
            <VerificationNote />
            <div className={styles.cards} role="group" aria-label="Expansion candidates">
              {t.candidates.map((c) => (
                <CandidateCard
                  key={c.id} c={c} selected={selected.has(c.id)}
                  onToggle={() => toggle(c.id)}
                  onReject={() => { setSelected((s) => { const n = new Set(s); n.delete(c.id); return n; }); void decide(t.id, { rejected_ids: [c.id] }); }}
                  onUndo={() => void decide(t.id, { reset_ids: [c.id] })}
                  onRefine={() => { setComposerText(`Refine: ${c.text}`); focusComposer(); }}
                  onCite={(ev) => ev.page && scrollToPage(ev.page, ev.quote)}
                />
              ))}
            </div>
            <div className={styles.footer}>
              <button className={styles.ghost} disabled={pending.length === 0}
                onClick={() => { setSelected(new Set()); void decide(t.id, { rejected_ids: pending.map((c) => c.id) }); }}>
                Reject all
              </button>
              <button className={styles.ghostAccent} disabled={expanding} onClick={() => rerun(t)}>Regenerate</button>
              <div className={styles.grow} />
              <span className={styles.meta}>{picked.length} selected</span>
              <button
                className={styles.primary} disabled={picked.length === 0}
                onClick={() => { void decide(t.id, { selected_ids: picked.map((c) => c.id), add_to_review: true }); setSelected(new Set()); }}
              >
                Add to {SECTION_PLURAL[t.section]} →
              </button>
            </div>
          </div>
        );
      })}

      {expanding && (
        <div className={styles.turn}>
          {pendingJudgment && <JudgmentBubble judgment={pendingJudgment} attachments={lastRequest?.attachments ?? []} />}
          <Skeletons n={lastRequest?.params.num_candidates ? Math.min(3, lastRequest.params.num_candidates) : 3} />
        </div>
      )}

      {expandError && !expanding && (
        <div className={styles.error} role="alert">
          <span>{expandError}</span>
          {lastRequest && <button onClick={() => void expand(lastRequest)}>Retry</button>}
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
