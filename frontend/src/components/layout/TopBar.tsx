import { PanelLeft, BookOpenText, Check, SlidersHorizontal, AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { reviewToMarkdown } from "../../lib/markdown";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUiStore } from "../../store/uiStore";
import { SettingsPopover } from "../settings/SettingsPopover";
import styles from "./TopBar.module.css";

export function TopBar({ onReview }: { onReview: boolean }) {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const showToast = useUiStore((s) => s.showToast);
  const current = useSessionStore((s) => s.current);
  const saveState = useSessionStore((s) => s.saveState);
  const { providers, providerId, model } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { if (!onReview) setOpen(false); }, [onReview]);

  const provider = providers.find((p) => p.id === providerId);
  const shortName = provider ? (provider.id === "ukp" ? "UKP" : provider.id === "mock" ? "Mock" : provider.name) : "No provider";

  const exportReview = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(reviewToMarkdown(current));
      showToast("Review copied as Markdown");
    } catch {
      showToast("Could not access the clipboard");
    }
  };

  return (
    <header className={styles.bar}>
      <button className={styles.iconBtn} aria-label="Toggle chat history" title="Toggle chat history (Ctrl/⌘+B)" onClick={toggleSidebar}>
        <PanelLeft size={20} strokeWidth={1.8} aria-hidden />
      </button>
      <div className={styles.brand}>
        <span className={styles.mark}><BookOpenText size={15} strokeWidth={2.2} aria-hidden /></span>
        <span className={styles.name}>Review Assistant</span>
      </div>
      <span className={styles.sep} aria-hidden>/</span>
      {onReview && current ? (
        <>
          <span className={styles.title} title={current.title}>{current.title}</span>
          <span className={styles.venue}>{current.venue}</span>
        </>
      ) : (
        <span className={styles.title}>{onReview ? "Loading…" : "New review"}</span>
      )}
      <div className={styles.spacer} />
      {onReview && (
        <>
          <span className={styles.save} role="status" data-state={saveState}>
            {saveState === "saving" && <><Loader2 size={14} className={styles.spin} aria-hidden /> Saving…</>}
            {saveState === "saved" && <><Check size={14} strokeWidth={2.4} aria-hidden /> Saved</>}
            {saveState === "error" && <><AlertCircle size={14} aria-hidden /> Save failed</>}
          </span>
          <div className={styles.popAnchor}>
            <button
              ref={pillRef}
              className={styles.model}
              data-open={open}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-label="Model and generation settings"
              onClick={() => setOpen((v) => !v)}
            >
              <span className={styles.dot} data-ok={!!provider?.available} />
              <span className={styles.muted}>{shortName}</span>
              <strong>{model ?? "—"}</strong>
              <SlidersHorizontal size={14} aria-hidden />
            </button>
            {open && <SettingsPopover onClose={() => setOpen(false)} anchorRef={pillRef} />}
          </div>
          <button className={styles.export} onClick={exportReview} disabled={!current}>Export review</button>
        </>
      )}
    </header>
  );
}
