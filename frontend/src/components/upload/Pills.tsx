import styles from "./Upload.module.css";

interface Opt<T extends string> { value: T; label: string }
interface Props<T extends string> { label: string; options: Opt<T>[]; value: T; onChange: (v: T) => void }

function Pills<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.pills}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} data-on={value === o.value} className={styles.pill} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function VenuePicker(p: { value: string; onChange: (v: string) => void }) {
  return <Pills label="Venue" value={p.value} onChange={p.onChange} options={["ARR", "ICLR", "Custom"].map((v) => ({ value: v, label: v }))} />;
}

export function RolePicker(p: { value: "reviewer" | "author"; onChange: (v: "reviewer" | "author") => void }) {
  return (
    <Pills label="Role" value={p.value} onChange={p.onChange} options={[{ value: "reviewer", label: "Reviewer" }, { value: "author", label: "Author (self-review)" }]} />
  );
}
