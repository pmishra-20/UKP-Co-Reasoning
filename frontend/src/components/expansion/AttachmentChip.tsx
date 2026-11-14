import { X } from "lucide-react";
import type { EvidenceRef } from "../../api/types";
import styles from "./Composer.module.css";

export function AttachmentChip({ a, onRemove }: { a: EvidenceRef; onRemove: () => void }) {
  return (
    <span className={styles.chip}>
      <b>{a.kind === "evidence" ? "Evidence" : "Snippet"}</b>
      <span className={styles.chipText}>“{a.text}”</span>
      <span className={styles.chipPage}>p. {a.page}</span>
      <button aria-label="Remove attachment" onClick={onRemove}><X size={12} aria-hidden /></button>
    </span>
  );
}
