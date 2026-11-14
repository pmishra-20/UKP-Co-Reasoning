import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReviewItem } from "../../api/types";
import styles from "./Review.module.css";

interface Props {
  title: string;
  items: ReviewItem[];
  freshIds: Set<string>;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onCite: (item: ReviewItem) => void;
}

function Item({ item, fresh, onEdit, onDelete, onCite }: { item: ReviewItem; fresh: boolean } & Omit<Props, "title" | "items" | "freshIds">) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!editing) setDraft(item.text); }, [item.text, editing]);
  useEffect(() => {
    if (editing && ta.current) {
      ta.current.style.height = "auto";
      ta.current.style.height = ta.current.scrollHeight + "px";
      ta.current.focus();
    }
  }, [editing, draft]);

  const save = () => {
    setEditing(false);
    const t = draft.trim();
    if (!t) onDelete(item.id);
    else if (t !== item.text) onEdit(item.id, t);
  };

  return (
    <div className={styles.item} data-fresh={fresh}>
      {editing ? (
        <textarea
          ref={ta} className={styles.edit} value={draft} aria-label="Edit review item"
          onChange={(e) => setDraft(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(item.text); setEditing(false); } }}
        />
      ) : (
        <p className={styles.text} onClick={() => setEditing(true)} tabIndex={0} role="button" aria-label="Edit review item"
           onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}>
          {item.text}
        </p>
      )}
      {item.source_page ? (
        <button className={styles.src} onClick={() => onCite(item)} aria-label={`Go to page ${item.source_page} in the paper`}>· p. {item.source_page}</button>
      ) : null}
      <button className={styles.del} aria-label="Delete review item" onClick={() => onDelete(item.id)}><X size={14} aria-hidden /></button>
    </div>
  );
}

export function ReviewSection({ title, items, freshIds, onEdit, onDelete, onCite }: Props) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sTitle}>{title}</h3>
      {items.length === 0 ? (
        <span className={styles.hint}>Accepted expansions land here.</span>
      ) : (
        items.map((it) => <Item key={it.id} item={it} fresh={freshIds.has(it.id)} onEdit={onEdit} onDelete={onDelete} onCite={onCite} />)
      )}
    </div>
  );
}
