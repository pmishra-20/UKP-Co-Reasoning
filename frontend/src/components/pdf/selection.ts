export interface CapturedSelection { text: string; page: number; wordCount: number }

const LAYER = ".textLayer, .react-pdf__Page__textContent";

const elOf = (n: Node | null): Element | null => (!n ? null : n.nodeType === 1 ? (n as Element) : n.parentElement);

/**
 * The current window selection, if it is non-empty and lies fully inside PDF text layers
 * under `root`. Otherwise null (the native context menu should then be shown).
 */
export function captureSelection(root: HTMLElement): CapturedSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const text = sel.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const range = sel.getRangeAt(0);
  const inLayer = (n: Node) => {
    const el = elOf(n);
    return !!el && root.contains(el) && !!el.closest(LAYER);
  };
  if (!inLayer(range.startContainer) || !inLayer(range.endContainer)) return null;
  const pageEl = elOf(sel.anchorNode)?.closest<HTMLElement>("[data-ra-page]");
  const page = Number(pageEl?.dataset.raPage);
  if (!page) return null;
  return { text, page, wordCount: text.split(" ").length };
}
