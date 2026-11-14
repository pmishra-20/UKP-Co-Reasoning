import { ChevronLeft, ChevronRight, Minus, Plus, Search, MoveHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useUiStore } from "../../store/uiStore";
import styles from "./PdfToolbar.module.css";

export function PdfToolbar({ onFit }: { onFit: () => void }) {
  const { page, zoom, numPages } = useUiStore((s) => s.pdf);
  const setZoom = useUiStore((s) => s.setZoom);
  const scrollToPage = useUiStore((s) => s.scrollToPage);
  const showToast = useUiStore((s) => s.showToast);
  const evidenceCount = useUiStore((s) => s.highlights.filter((h) => h.kind === "evidence").length);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => setDraft(null), [page]);
  const go = (p: number) => scrollToPage(Math.min(Math.max(1, p), Math.max(1, numPages)));
  const commit = () => {
    const n = parseInt(draft ?? "", 10);
    if (!Number.isNaN(n)) go(n);
    setDraft(null);
  };

  return (
    <div className={styles.bar} role="toolbar" aria-label="PDF controls">
      <button className={styles.btn} aria-label="Previous page" disabled={page <= 1} onClick={() => go(page - 1)}><ChevronLeft size={16} aria-hidden /></button>
      <label className={styles.pageBox}>
        <span className="sr-only">Page</span>
        <input
          aria-label="Page number" inputMode="numeric" value={draft ?? String(page)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setDraft(null); }}
        />
        <span className={styles.muted}>/ {numPages || "–"}</span>
      </label>
      <button className={styles.btn} aria-label="Next page" disabled={page >= numPages} onClick={() => go(page + 1)}><ChevronRight size={16} aria-hidden /></button>
      <span className={styles.sep} />
      <button className={styles.btn} aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(zoom - 10)}><Minus size={16} aria-hidden /></button>
      <span className={styles.zoom} aria-live="polite">{zoom}%</span>
      <button className={styles.btn} aria-label="Zoom in" disabled={zoom >= 300} onClick={() => setZoom(zoom + 10)}><Plus size={16} aria-hidden /></button>
      <button className={styles.btn} aria-label="Fit width" title="Fit width" onClick={onFit}><MoveHorizontal size={16} aria-hidden /></button>
      <div className={styles.spacer} />
      <span className={styles.pill}><span className={styles.sw} aria-hidden />{evidenceCount} evidence marked</span>
      <button className={styles.btn} aria-label="Search in document" title="Search in document" onClick={() => showToast("Use Ctrl/⌘+F to search the document text")}><Search size={16} aria-hidden /></button>
    </div>
  );
}
