import type { EvidenceRef } from "../../api/types";
import styles from "./Expansion.module.css";

export function JudgmentBubble({ judgment, attachments }: { judgment: string; attachments: EvidenceRef[] }) {
  const pages = [...new Set(attachments.map((a) => a.page))].sort((a, b) => a - b);
  return (
    <div className={styles.bubble}>
      {judgment}
      {attachments.length > 0 && (
        <div className={styles.chips}>
          <span className={styles.chip}>{attachments.length} evidence · p. {pages.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
