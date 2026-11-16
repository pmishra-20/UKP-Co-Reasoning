/** Locating a piece of text inside pdf.js text-layer spans. */

export function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Returns the inclusive span-index range [first, last] whose text covers `needle`,
 * or null. Matching is on normalized text; hyphenated line breaks are re-joined.
 */
export function findSpanRange(spanTexts: string[], needle: string): [number, number] | null {
  const n = norm(needle).replace(/- (?=[a-z])/g, "-");
  if (!n) return null;
  let acc = "";
  const starts: number[] = [];
  const ends: number[] = [];
  spanTexts.forEach((raw) => {
    const t = norm(raw);
    if (acc.endsWith("-") && /^[a-z]/.test(t)) acc = acc.slice(0, -1);
    else if (acc && t) acc += " ";
    starts.push(acc.length);
    acc += t;
    ends.push(acc.length);
  });
  const locate = (from: number, to: number): [number, number] | null => {
    let first = -1, last = -1;
    for (let i = 0; i < spanTexts.length; i++) {
      if (ends[i] > from && starts[i] < to && ends[i] > starts[i]) {
        if (first < 0) first = i;
        last = i;
      }
    }
    return first < 0 ? null : [first, last];
  };
  const idx = acc.indexOf(n);
  if (idx >= 0) return locate(idx, idx + n.length);

  // Fallback: anchor on the beginning and the end of the needle.
  const k = Math.min(40, Math.floor(n.length / 2));
  if (k < 12) return null;
  const a = acc.indexOf(n.slice(0, k));
  if (a < 0) return null;
  const b = acc.indexOf(n.slice(-k), a);
  if (b < 0) return null;
  return locate(a, b + k);
}

/** The leaf spans of a pdf.js text layer that carry text. */
export function textSpans(layer: Element): HTMLElement[] {
  return Array.from(layer.querySelectorAll<HTMLElement>("span")).filter(
    (el) => el.children.length === 0 && (el.textContent ?? "").trim() !== "",
  );
}
