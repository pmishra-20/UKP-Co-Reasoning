import { CircleAlert } from "lucide-react";
import styles from "./Expansion.module.css";

export function VerificationNote() {
  return (
    <div role="note" className={styles.note}>
      <CircleAlert size={16} aria-hidden style={{ flex: "0 0 auto", marginTop: 1 }} />
      <span>Each candidate cites where it comes from. Open the citation and check it against the paper before adding it to your review.</span>
    </div>
  );
}
