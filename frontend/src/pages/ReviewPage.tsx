import { useCallback, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { ExpansionPanel } from "../components/expansion/ExpansionPanel";
import { Composer } from "../components/expansion/Composer";
import { PdfViewer } from "../components/pdf/PdfViewer";
import { ReviewOutput } from "../components/review/ReviewOutput";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";
import styles from "./ReviewPage.module.css";

const MIN_COL = 380;

export function ReviewPage() {
  const { sessionId = "" } = useParams();
  const { current, loading, error, loadSession } = useSessionStore();
  const panelWidth = useUiStore((s) => s.panelWidth);
  const setPanelWidth = useUiStore((s) => s.setPanelWidth);
  const resetWorkspace = useUiStore((s) => s.resetWorkspace);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetWorkspace(sessionId);
    void loadSession(sessionId);
  }, [sessionId, loadSession, resetWorkspace]);

  const resizeTo = useCallback((clientX: number) => {
    const row = rowRef.current;
    if (!row) return;
    const r = row.getBoundingClientRect();
    const w = r.right - clientX - 3;
    setPanelWidth(Math.round(Math.min(Math.max(w, MIN_COL), Math.max(MIN_COL, r.width - MIN_COL - 6))));
  }, [setPanelWidth]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (ev: PointerEvent) => resizeTo(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!current || current.id !== sessionId) {
    return (
      <div className={styles.state}>
        {loading ? <p>Loading review…</p> : (
          <>
            <p role="alert">{error ?? "Review not found."}</p>
            <Link to="/new">Start a new review</Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div ref={rowRef} className={styles.row} style={{ "--panel-w": `${panelWidth}px` } as React.CSSProperties}>
      <section aria-label="PDF reader" className={styles.pdf}>
        <PdfViewer key={current.document.id} fileUrl={api.documentUrl(current.document.id)} />
      </section>
      <div
        role="separator" aria-orientation="vertical" aria-label="Resize panels" aria-valuenow={panelWidth}
        tabIndex={0} className={styles.handle} onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPanelWidth(panelWidth + 24);
          if (e.key === "ArrowRight") setPanelWidth(Math.max(MIN_COL, panelWidth - 24));
        }}
      />
      <section aria-label="Review workspace" className={styles.panel}>
        <div className={styles.scroll}>
          <ReviewOutput />
          <ExpansionPanel />
        </div>
        <Composer />
      </section>
    </div>
  );
}
