import { create } from "zustand";
import type { EvidenceRef, Section } from "../api/types";
import { readJson, writeJson } from "../lib/storage";

export interface Highlight { page: number; text: string; kind: "evidence" | "highlight" }
export interface ScrollRequest { page: number; quote?: string; nonce: number }

const isNarrow = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 900px)").matches;
export const ZOOM_MIN = 50;
export const ZOOM_MAX = 300;

let uid = 0;
const newId = () => `${Date.now().toString(36)}${(uid++).toString(36)}`;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

interface UiState {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;

  panelWidth: number;
  setPanelWidth: (w: number) => void;

  attachments: EvidenceRef[];
  addAttachment: (a: Omit<EvidenceRef, "id">) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  highlightSession: string | null;
  highlights: Highlight[];
  addHighlight: (h: Highlight) => void;

  composerText: string;
  composerSel: [number, number];
  focusNonce: number;
  composerSection: Section;
  setComposerText: (t: string, sel?: [number, number]) => void;
  setComposerSel: (sel: [number, number]) => void;
  insertAtCaret: (text: string) => void;
  focusComposer: () => void;
  setSection: (s: Section) => void;

  pdf: { page: number; zoom: number; numPages: number };
  setPdfPage: (p: number) => void;
  setZoom: (z: number) => void;
  setNumPages: (n: number) => void;
  scrollRequest: ScrollRequest | null;
  scrollToPage: (page: number, quote?: string) => void;

  toast: string | null;
  showToast: (msg: string) => void;

  resetWorkspace: (sessionId: string | null) => void;
}

const hlKey = (id: string) => `ra.hl.${id}`;

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: isNarrow() ? false : readJson<boolean>("ra.sidebarOpen", true),
  setSidebarOpen: (v) => { set({ sidebarOpen: v }); writeJson("ra.sidebarOpen", v); },
  toggleSidebar: () => get().setSidebarOpen(!get().sidebarOpen),

  panelWidth: readJson<number>("ra.panelWidth", 480),
  setPanelWidth: (w) => { set({ panelWidth: w }); writeJson("ra.panelWidth", w); },

  attachments: [],
  addAttachment: (a) => {
    if (get().attachments.some((x) => x.kind === a.kind && x.text === a.text && x.page === a.page)) return;
    set({ attachments: [...get().attachments, { ...a, id: newId() }] });
  },
  removeAttachment: (id) => set({ attachments: get().attachments.filter((a) => a.id !== id) }),
  clearAttachments: () => set({ attachments: [] }),

  highlightSession: null,
  highlights: [],
  addHighlight: (h) => {
    const cur = get().highlights;
    const existing = cur.findIndex((x) => x.page === h.page && x.text === h.text);
    let next: Highlight[];
    if (existing >= 0) {
      // evidence wins over a plain highlight of the same text
      if (cur[existing].kind === "evidence" || h.kind === "highlight") return;
      next = cur.map((x, i) => (i === existing ? h : x));
    } else next = [...cur, h];
    set({ highlights: next });
    const sid = get().highlightSession;
    if (sid) writeJson(hlKey(sid), next);
  },

  composerText: "",
  composerSel: [0, 0],
  focusNonce: 0,
  composerSection: "weaknesses",
  setComposerText: (t, sel) => set({ composerText: t, composerSel: sel ?? [t.length, t.length] }),
  setComposerSel: (sel) => set({ composerSel: sel }),
  insertAtCaret: (text) => {
    const { composerText: t, composerSel: [a, b] } = get();
    const start = Math.min(a, t.length), end = Math.min(b, t.length);
    const next = t.slice(0, start) + text + t.slice(end);
    const caret = start + text.length;
    set({ composerText: next, composerSel: [caret, caret], focusNonce: get().focusNonce + 1 });
  },
  focusComposer: () => set({ focusNonce: get().focusNonce + 1 }),
  setSection: (s) => set({ composerSection: s }),

  pdf: { page: 1, zoom: 100, numPages: 0 },
  setPdfPage: (page) => set({ pdf: { ...get().pdf, page } }),
  setZoom: (z) => set({ pdf: { ...get().pdf, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z))) } }),
  setNumPages: (numPages) => set({ pdf: { ...get().pdf, numPages } }),
  scrollRequest: null,
  scrollToPage: (page, quote) => set({ scrollRequest: { page, quote, nonce: Date.now() + uid++ } }),

  toast: null,
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2400);
  },

  resetWorkspace: (sessionId) => {
    set({
      attachments: [],
      composerText: "",
      composerSel: [0, 0],
      highlightSession: sessionId,
      highlights: sessionId ? readJson<Highlight[]>(hlKey(sessionId), []) : [],
      // numPages is owned by PdfViewer (it can finish loading before this runs)
      pdf: { ...get().pdf, page: 1 },
      scrollRequest: null,
    });
  },
}));
