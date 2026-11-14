import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DocumentMeta, Role } from "../api/types";
import { Dropzone } from "../components/upload/Dropzone";
import { RolePicker } from "../components/upload/RolePicker";
import { VenuePicker } from "../components/upload/VenuePicker";
import { useSessionStore } from "../store/sessionStore";
import styles from "./NewReviewPage.module.css";

export function NewReviewPage() {
  const [doc, setDoc] = useState<DocumentMeta | null>(null);
  const [venue, setVenue] = useState("ARR");
  const [role, setRole] = useState<Role>("reviewer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const createSession = useSessionStore((s) => s.createSession);
  const navigate = useNavigate();

  const start = async () => {
    if (!doc || busy) return;
    setBusy(true);
    setErr(null);
    const s = await createSession(doc.id, venue, role);
    setBusy(false);
    if (s) navigate(`/r/${s.id}`);
    else setErr(useSessionStore.getState().error ?? "Could not create the review.");
  };

  return (
    <div className={styles.page}>
      <div className={styles.col}>
        <div>
          <h1>Start a new review</h1>
          <p>Upload the paper, pick the venue, and write your first judgment. Expansions will be grounded in the document.</p>
        </div>
        <Dropzone doc={doc} onChange={setDoc} />
        <div className={styles.grid}>
          <div className={styles.field}>
            <span className={styles.lbl}>Venue</span>
            <VenuePicker value={venue} onChange={setVenue} />
            <span className={styles.help}>Venue guidelines plug in here later.</span>
          </div>
          <div className={styles.field}>
            <span className={styles.lbl}>I am reviewing as</span>
            <RolePicker value={role} onChange={setRole} />
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.start} disabled={!doc || busy} onClick={start}>
            {busy ? "Opening…" : "Open review workspace →"}
          </button>
          <span className={styles.help}>{doc ? `${venue} · ${role === "author" ? "Author (self-review)" : "Reviewer"}` : "Upload a PDF to continue"}</span>
        </div>
        {err && <p className={styles.err} role="alert">{err}</p>}
      </div>
    </div>
  );
}
