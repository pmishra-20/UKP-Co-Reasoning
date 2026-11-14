import { useEffect, useRef, type RefObject } from "react";
import type { Verbosity } from "../../api/types";
import { useSettingsStore } from "../../store/settingsStore";
import styles from "./SettingsPopover.module.css";

const VERBOSITY: { id: Verbosity; label: string; hint: string }[] = [
  { id: "concise", label: "Concise", hint: "1–2 sentences per candidate." },
  { id: "balanced", label: "Balanced", hint: "2–4 sentences per candidate." },
  { id: "detailed", label: "Detailed", hint: "A full paragraph (4–6 sentences) per candidate." },
];
const SUBLINE: Record<string, string> = {
  ukp: "Internal inference API",
  mock: "Offline · deterministic output",
  openai: "Set OPENAI_COMPAT_* in backend .env",
};
const MAX_LEN: { value: number | null; label: string }[] = [
  { value: null, label: "Auto (from verbosity)" },
  { value: 256, label: "256 tokens" },
  { value: 512, label: "512 tokens" },
  { value: 1024, label: "1024 tokens" },
];

export function SettingsPopover({ onClose, anchorRef }: { onClose: () => void; anchorRef: RefObject<HTMLElement | null> }) {
  const { providers, providerId, model, params, setProvider, setModel, setParams, reset } = useSettingsStore();
  const ref = useRef<HTMLDivElement>(null);
  const provider = providers.find((p) => p.id === providerId);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchorRef.current?.contains(t)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { onClose(); anchorRef.current?.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [onClose, anchorRef]);

  const badge = (id: string, available: boolean) =>
    !available ? { text: "Not configured", cls: styles.badgeOff } : id === "mock" ? { text: "Dev", cls: styles.badgeOn } : { text: "Connected", cls: styles.badgeOn };
  const hint = VERBOSITY.find((v) => v.id === params.verbosity)!.hint;

  return (
    <div ref={ref} role="dialog" aria-label="Generation settings" className={styles.pop}>
      <div className={styles.head}>
        <div className={styles.h}>Generation settings</div>
        <div className={styles.sub}>Applies to new expansions.</div>
      </div>

      <div className={styles.scroll}>
        <section className={styles.group}>
          <div className="label-caps">API provider</div>
          <div role="radiogroup" aria-label="API provider" className={styles.providers}>
            {providers.map((p) => {
              const on = p.id === providerId;
              const b = badge(p.id, p.available);
              return (
                <button
                  key={p.id} role="radio" aria-checked={on} disabled={!p.available}
                  className={styles.provider} data-on={on} onClick={() => setProvider(p.id)}
                >
                  <span className={styles.radio} data-on={on} />
                  <span className={styles.pText}>
                    <span className={styles.pName}>{p.name}</span>
                    <span className={styles.pSub}>{SUBLINE[p.id] ?? "Custom provider"}{p.available && p.default_model ? ` · ${p.default_model}` : ""}</span>
                  </span>
                  <span className={`${styles.badge} ${b.cls}`}>{b.text}</span>
                </button>
              );
            })}
            {providers.length === 0 && <p className={styles.sub}>No providers found. Is the backend running?</p>}
          </div>
          <label className={styles.field}>
            Model
            <select value={model ?? ""} onChange={(e) => setModel(e.target.value)} disabled={!provider}>
              {(provider?.models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </section>

        <section className={styles.group}>
          <div className="label-caps">Output</div>

          <div className={styles.row2}>
            <span className={styles.lbl}>Verbosity</span>
            <div role="radiogroup" aria-label="Verbosity" className={styles.seg}>
              {VERBOSITY.map((v) => (
                <button key={v.id} role="radio" aria-checked={params.verbosity === v.id} data-on={params.verbosity === v.id} onClick={() => setParams({ verbosity: v.id })}>
                  {v.label}
                </button>
              ))}
            </div>
            <span className={styles.sub}>{hint}</span>
          </div>

          <div className={styles.inline}>
            <span className={styles.lbl}>Candidates per judgment</span>
            <div className={styles.stepper}>
              <button aria-label="Fewer candidates" onClick={() => setParams({ num_candidates: Math.max(2, params.num_candidates - 1) })} disabled={params.num_candidates <= 2}>−</button>
              <span aria-live="polite">{params.num_candidates}</span>
              <button aria-label="More candidates" onClick={() => setParams({ num_candidates: Math.min(6, params.num_candidates + 1) })} disabled={params.num_candidates >= 6}>+</button>
            </div>
          </div>

          <label className={styles.row2}>
            <span className={styles.lblRow}><span className={styles.lbl}>Diversity (temperature)</span><span className={styles.val}>{params.temperature.toFixed(1)}</span></span>
            <input
              type="range" min={0} max={15} step={1} value={Math.round(params.temperature * 10)}
              onChange={(e) => setParams({ temperature: Number(e.target.value) / 10 })}
              aria-label="Diversity (temperature)"
            />
            <span className={styles.ends}><span>Focused</span><span>Varied</span></span>
          </label>

          <label className={styles.inline}>
            <span className={styles.lbl}>Max length</span>
            <select
              value={params.max_tokens ?? ""}
              onChange={(e) => setParams({ max_tokens: e.target.value === "" ? null : Number(e.target.value) })}
            >
              {MAX_LEN.map((o) => <option key={o.label} value={o.value ?? ""}>{o.label}</option>)}
            </select>
          </label>
          <span className={styles.sub}>Token limit for the whole response. Very small limits can cut a response off.</span>
        </section>
      </div>

      <div className={styles.foot}>
        <span className={styles.status}>{provider ? `${provider.name} · ${model ?? "—"}` : "No provider"}</span>
        <button className={styles.ghost} onClick={reset}>Reset</button>
        <button className={styles.primary} onClick={() => { onClose(); anchorRef.current?.focus(); }}>Apply</button>
      </div>
    </div>
  );
}
