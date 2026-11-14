import { useEffect } from "react";
import { Outlet, useMatch } from "react-router-dom";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUiStore } from "../../store/uiStore";
import { HistorySidebar } from "./HistorySidebar";
import { TopBar } from "./TopBar";
import styles from "./AppShell.module.css";

export function AppShell() {
  const loadSummaries = useSessionStore((s) => s.loadSummaries);
  const loadProviders = useSettingsStore((s) => s.loadProviders);
  const toast = useUiStore((s) => s.toast);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const onReview = useMatch("/r/:sessionId");

  useEffect(() => {
    void loadSummaries();
    void loadProviders();
  }, [loadSummaries, loadProviders]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  return (
    <div className={styles.shell}>
      <TopBar onReview={!!onReview} />
      <div className={styles.body}>
        <HistorySidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </div>
  );
}
