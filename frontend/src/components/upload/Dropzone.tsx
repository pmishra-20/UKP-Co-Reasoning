import { FileUp, X } from "lucide-react";
import { useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import type { DocumentMeta } from "../../api/types";
import styles from "./Upload.module.css";

const MAX_MB = 25;

interface Props { doc: DocumentMeta | null; onChange: (d: DocumentMeta | null) => void }

export function Dropzone({ doc, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("That file is not a PDF. Please choose a .pdf file.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_MB} MB.`);
      return;
    }
    setProgress(0);
    try {
      onChange(await api.uploadDocument(file, setProgress));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  };

  if (doc) {
    return (
      <div className={styles.fileCard}>
        <span className={styles.pdfBadge}>PDF</span>
        <span className={styles.fileText}>
          <span className={styles.fileName}>{doc.filename}</span>
          <span className={styles.fileMeta}>Uploaded · {doc.num_pages} page{doc.num_pages === 1 ? "" : "s"} · text extracted</span>
        </span>
        <button className={styles.remove} aria-label="Remove file" onClick={() => onChange(null)}><X size={18} aria-hidden /></button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={styles.drop}
        data-over={over}
        disabled={progress !== null}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files[0]); }}
      >
        <span className={styles.dropIcon}><FileUp size={22} aria-hidden /></span>
        {progress === null ? (
          <>
            <span className={styles.dropTitle}>Drop a PDF here, or browse</span>
            <span className={styles.dropSub}>PDF only · up to {MAX_MB} MB · stays on your server</span>
          </>
        ) : (
          <>
            <span className={styles.dropTitle}>{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : "Extracting text…"}</span>
            <span className={styles.bar} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
