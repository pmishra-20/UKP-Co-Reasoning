import { ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Section, Verbosity } from "../../api/types";
import { SECTIONS, SECTION_SINGULAR } from "../../lib/sections";
import { useSessionStore } from "../../store/sessionStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUiStore } from "../../store/uiStore";
import { AttachmentChip } from "./AttachmentChip";
import styles from "./Composer.module.css";

const VERB: { id: Verbosity; label: string }[] = [
  { id: "concise", label: "Concise" }, { id: "balanced", label: "Balanced" }, { id: "detailed", label: "Detailed" },
];

export function Composer() {
  const ui = useUiStore();
  const { providerId, model, params, setParams } = useSettingsStore();
  const { expand, expanding, current } = useSessionStore();
  const ta = useRef<HTMLTextAreaElement>(null);

  // Auto-grow 2 → 8 rows.
  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 21 * 8) + "px";
  }, [ui.composerText]);

  // Focus + caret placement requested from the PDF menu / Refine.
  useEffect(() => {
    if (ui.focusNonce === 0) return;
    const el = ta.current;
    if (!el) return;
    el.focus();
    const [a, b] = ui.composerSel;
    el.setSelectionRange(a, b);
  }, [ui.focusNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = ui.composerText.trim();
  const canSubmit = text.length >= 3 && !expanding && !!current && !!providerId;

  const submit = async () => {
    if (!canSubmit || !providerId) return;
    const turn = await expand({
      judgment: text, section: ui.composerSection, attachments: ui.attachments,
      provider_id: providerId, model, params,
    });
    if (turn) {
      ui.setComposerText("");
      ui.clearAttachments();
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.box}>
        {ui.attachments.length > 0 && (
          <div className={styles.chips}>
            {ui.attachments.map((a) => <AttachmentChip key={a.id} a={a} onRemove={() => ui.removeAttachment(a.id)} />)}
          </div>
        )}
        <label className="sr-only" htmlFor="judgment">Your judgment</label>
        <textarea
          id="judgment" ref={ta} rows={2} className={styles.ta} value={ui.composerText}
          placeholder={'Write a judgment, e.g. "The experimental evaluation is a weakness." Right-click text in the PDF to attach evidence.'}
          onChange={(e) => ui.setComposerText(e.target.value, [e.target.selectionStart, e.target.selectionEnd])}
          onSelect={(e) => ui.setComposerSel([e.currentTarget.selectionStart, e.currentTarget.selectionEnd])}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); }
          }}
        />
        <div className={styles.row}>
          <select aria-label="Review section" value={ui.composerSection} onChange={(e) => ui.setSection(e.target.value as Section)}>
            {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_SINGULAR[s]}</option>)}
          </select>
          <div role="radiogroup" aria-label="Verbosity" className={styles.seg}>
            {VERB.map((v) => (
              <button key={v.id} role="radio" aria-checked={params.verbosity === v.id} data-on={params.verbosity === v.id} onClick={() => setParams({ verbosity: v.id })}>
                {v.label}
              </button>
            ))}
          </div>
          <div className={styles.grow} />
          <button className={styles.go} disabled={!canSubmit} onClick={() => void submit()}>
            {expanding ? <><Loader2 size={14} className={styles.spin} aria-hidden /> Expanding…</> : <>Expand <ArrowRight size={14} strokeWidth={2.2} aria-hidden /></>}
          </button>
        </div>
      </div>
      <div className={styles.foot}>Candidates are drafts grounded in the paper — you decide what goes in your review.</div>
    </div>
  );
}
