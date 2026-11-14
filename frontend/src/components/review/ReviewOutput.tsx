import { useEffect, useRef, useState } from "react";
import type { ReviewItem } from "../../api/types";
import { reviewToMarkdown, reviewWordCount } from "../../lib/markdown";
import { SECTIONS, SECTION_PLURAL } from "../../lib/sections";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore } from "../../store/uiStore";
import { ReviewSection } from "./ReviewSection";
import styles from "./Review.module.css";

export function ReviewOutput() {
  const session = useSessionStore((s) => s.current)!;
  const updateReview = useSessionStore((s) => s.updateReview);
  const showToast = useUiStore((s) => s.showToast);
  const scrollToPage = useUiStore((s) => s.scrollToPage);

  // Items that appear after the first render of this session flash briefly.
  const seen = useRef<{ sid: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set(session.review.map((r) => r.id));
    if (!seen.current || seen.current.sid !== session.id) {
      seen.current = { sid: session.id, ids };
      setFresh(new Set());
      return;
    }
    const added = [...ids].filter((id) => !seen.current!.ids.has(id));
    seen.current.ids = ids;
    if (added.length) {
      setFresh(new Set(added));
      const t = setTimeout(() => setFresh(new Set()), 1500);
      return () => clearTimeout(t);
    }
  }, [session.id, session.review]);

  const edit = (id: string, text: string) => void updateReview(session.review.map((r) => (r.id === id ? { ...r, text } : r)));
  const del = (id: string) => void updateReview(session.review.filter((r) => r.id !== id));
  const cite = (item: ReviewItem) => {
    const quote = session.turns
      .find((t) => t.id === item.source_turn_id)
      ?.candidates.find((c) => c.id === item.source_candidate_id)
      ?.evidence.find((e) => e.verified && e.page === item.source_page)?.quote;
    if (item.source_page) scrollToPage(item.source_page, quote);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reviewToMarkdown(session));
      showToast("Review copied as Markdown");
    } catch {
      showToast("Could not access the clipboard");
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.cap}>Your review</span>
        <span className={styles.form}>· {session.venue} form</span>
        <div className={styles.grow} />
        <span className={styles.form}>{reviewWordCount(session)} words</span>
        <button className={styles.copy} onClick={copy}>Copy</button>
      </div>
      <div className={styles.body}>
        {SECTIONS.map((sec) => (
          <ReviewSection
            key={sec} title={SECTION_PLURAL[sec]} items={session.review.filter((r) => r.section === sec)}
            freshIds={fresh} onEdit={edit} onDelete={del} onCite={cite}
          />
        ))}
      </div>
    </div>
  );
}
