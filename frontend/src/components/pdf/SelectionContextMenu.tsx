import { Copy, Highlighter, PenLine, Quote } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useUiStore } from "../../store/uiStore";
import { captureSelection, type CapturedSelection } from "./selection";
import styles from "./SelectionContextMenu.module.css";

interface MenuState extends CapturedSelection { x: number; y: number }
interface Props { containerRef: RefObject<HTMLElement | null>; disabled?: boolean }

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

export function SelectionContextMenu({ containerRef, disabled = false }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  const close = useCallback((restoreFocus = true) => {
    setMenu(null);
    setPos(null);
    if (restoreFocus && prevFocus.current?.isConnected) prevFocus.current.focus({ preventScroll: true });
    prevFocus.current = null;
  }, []);

  // Open on right-click, only when a selection sits inside the PDF text layers.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const onContext = (e: MouseEvent) => {
      const sel = captureSelection(root);
      if (!sel) return; // native menu
      e.preventDefault();
      prevFocus.current = document.activeElement as HTMLElement | null;
      setMenu({ ...sel, x: e.clientX, y: e.clientY });
    };
    root.addEventListener("contextmenu", onContext);
    return () => root.removeEventListener("contextmenu", onContext);
  }, [containerRef]);

  // Clamp to the viewport once the menu's size is known, then focus the first item.
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const { width, height } = menuRef.current.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)),
    });
    menuRef.current.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [menu]);

  const actions = useRef<Record<string, () => void>>({});
  actions.current = {
    evidence: () => {
      if (!menu) return;
      const ui = useUiStore.getState();
      ui.addAttachment({ kind: "evidence", text: menu.text, page: menu.page });
      ui.addHighlight({ page: menu.page, text: menu.text, kind: "evidence" });
      close();
    },
    snippet: () => {
      if (!menu) return;
      const ui = useUiStore.getState();
      ui.insertAtCaret(`“${menu.text}” (p. ${menu.page})`);
      ui.addAttachment({ kind: "snippet", text: menu.text, page: menu.page });
      close(false); // composer takes focus
    },
    judgment: () => {
      if (!menu) return;
      const ui = useUiStore.getState();
      ui.setComposerText("");
      ui.addAttachment({ kind: "evidence", text: menu.text, page: menu.page });
      ui.addHighlight({ page: menu.page, text: menu.text, kind: "evidence" });
      ui.focusComposer();
      close(false);
    },
    highlight: () => {
      if (!menu) return;
      useUiStore.getState().addHighlight({ page: menu.page, text: menu.text, kind: "highlight" });
      close();
    },
    copy: () => {
      if (!menu) return;
      void navigator.clipboard?.writeText(menu.text).catch(() => undefined);
      close();
    },
  };
  const run = (name: string) => { if (!disabled) actions.current[name]?.(); };

  // Dismissal + keyboard while open.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key === "Tab") { close(false); return; }
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); return; }
      if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); return; }
      if (e.key === "End") { e.preventDefault(); items[items.length - 1]?.focus(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); run("copy"); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const map: Record<string, string> = { e: "evidence", s: "snippet", j: "judgment" };
      if (map[k]) { e.preventDefault(); run(map[k]); }
    };
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) close(false); };
    const onAway = () => close(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onAway, true);
    window.addEventListener("resize", onAway);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onAway, true);
      window.removeEventListener("resize", onAway);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, close, disabled]);

  if (!menu) return null;
  const item = (name: string, icon: React.ReactNode, label: string, hint?: string, sub?: string, cls = "") => (
    <button role="menuitem" className={`${styles.item} ${cls}`} disabled={disabled} onClick={() => run(name)}>
      {icon}
      <span className={styles.itemText}>
        <span className={sub ? styles.strong : undefined}>{label}</span>
        {sub && <span className={styles.itemSub}>{sub}</span>}
      </span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Selection actions"
      className={styles.menu}
      style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={styles.header}>{menu.wordCount} word{menu.wordCount === 1 ? "" : "s"} selected · p. {menu.page}</div>
      {item("evidence", <span className={styles.swatch} aria-hidden />, "Add as evidence", "E", "Attach to the current judgment", styles.primary)}
      {item("snippet", <Quote size={14} aria-hidden />, "Insert as quoted snippet", "S")}
      {item("judgment", <PenLine size={14} aria-hidden />, "Start judgment from selection", "J")}
      <div className={styles.divider} role="separator" />
      {item("highlight", <Highlighter size={14} aria-hidden />, "Highlight")}
      {item("copy", <Copy size={14} aria-hidden />, "Copy", isMac ? "⌘C" : "Ctrl+C")}
    </div>
  );
}
