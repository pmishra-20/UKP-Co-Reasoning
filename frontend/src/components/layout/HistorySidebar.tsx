import { History, MoreHorizontal, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useMatch, useNavigate } from "react-router-dom";
import type { SessionSummary } from "../../api/types";
import { groupSummaries, summaryMeta } from "../../lib/grouping";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore } from "../../store/uiStore";
import styles from "./HistorySidebar.module.css";

function Item({ s }: { s: SessionSummary }) {
  const rename = useSessionStore((st) => st.rename);
  const remove = useSessionStore((st) => st.remove);
  const navigate = useNavigate();
  const active = useMatch(`/r/${s.id}`);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.title);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== s.title) void rename(s.id, t);
  };
  const del = async () => {
    setMenu(false);
    if (!window.confirm(`Delete "${s.title}"? This cannot be undone.`)) return;
    if (await remove(s.id) && active) navigate("/");
  };

  return (
    <div ref={wrapRef} className={styles.itemWrap} data-active={!!active}>
      {editing ? (
        <input
          className={styles.rename}
          autoFocus
          aria-label="Rename review"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(s.title); setEditing(false); }
          }}
        />
      ) : (
        <NavLink to={`/r/${s.id}`} className={styles.item}>
          <span className={styles.itemTitle}>{s.title}</span>
          <span className={styles.itemMeta}>{summaryMeta(s)}</span>
        </NavLink>
      )}
      {!editing && (
        <button className={styles.more} aria-label={`Options for ${s.title}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          <MoreHorizontal size={16} aria-hidden />
        </button>
      )}
      {menu && (
        <div role="menu" className={styles.menu}>
          <button role="menuitem" onClick={() => { setMenu(false); setDraft(s.title); setEditing(true); }}>Rename</button>
          <button role="menuitem" className={styles.danger} onClick={del}>Delete</button>
        </div>
      )}
    </div>
  );
}

export function HistorySidebar() {
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const { summaries, summariesLoaded } = useSessionStore();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const f = q.trim().toLowerCase();
    return groupSummaries(f ? summaries.filter((s) => s.title.toLowerCase().includes(f)) : summaries);
  }, [summaries, q]);

  if (!open) {
    return (
      <nav aria-label="Review history (collapsed)" className={styles.rail}>
        <NavLink to="/new" className={styles.railBtn} aria-label="New review"><Plus size={16} aria-hidden /></NavLink>
        <button className={styles.railBtn} aria-label="Open review history" onClick={() => setOpen(true)}>
          <History size={18} aria-hidden />
        </button>
      </nav>
    );
  }
  return (
    <>
      <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden />
      <nav aria-label="Review history" className={styles.sidebar}>
        <NavLink to="/new" className={styles.newBtn}><Plus size={16} aria-hidden /> New review</NavLink>
        <label className={styles.search}>
          <Search size={15} aria-hidden />
          <input type="search" placeholder="Search reviews" aria-label="Search reviews" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className={styles.groups}>
          {groups.map((g) => (
            <div key={g.label} className={styles.group}>
              <div className={`label-caps ${styles.groupLabel}`}>{g.label}</div>
              {g.items.map((s) => <Item key={s.id} s={s} />)}
            </div>
          ))}
          {summariesLoaded && groups.length === 0 && (
            <p className={styles.empty}>{q ? "No reviews match your search." : "No reviews yet. Start one with New review."}</p>
          )}
        </div>
      </nav>
    </>
  );
}
