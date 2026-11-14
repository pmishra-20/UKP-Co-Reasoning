import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { useSessionStore } from "../../store/sessionStore";
import { useUiStore, type Highlight, type ScrollRequest } from "../../store/uiStore";
import { findSpanRange, textSpans } from "./match";
import { PdfToolbar } from "./PdfToolbar";
import { SelectionContextMenu } from "./SelectionContextMenu";
import styles from "./PdfViewer.module.css";

// Must be configured in the same module that renders <Document>/<Page> (react-pdf README).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const BASE_WIDTH = 720; // px at 100% zoom
const EMPTY: Highlight[] = [];
const LAYER = ".textLayer, .react-pdf__Page__textContent";

interface PageViewProps {
  pageNumber: number;
  width: number;
  height: number;
  render: boolean;
  highlights: Highlight[];
  flash: ScrollRequest | null;
  io: IntersectionObserver | null;
}

function PageView({ pageNumber, width, height, render, highlights, flash, io }: PageViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [textVersion, setTextVersion] = useState(0);
  // Stable identity: react-pdf re-renders the text layer when these callbacks change.
  const onTextRendered = useCallback(() => setTextVersion((v) => v + 1), []);
  const placeholder = useMemo(() => <div className={styles.placeholder} style={{ width, height }} />, [width, height]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !io) return;
    io.observe(el);
    return () => io.unobserve(el);
  }, [io]);

  // (Re)apply persistent highlights whenever the text layer (re)renders or highlights change.
  useEffect(() => {
    const layer = wrapRef.current?.querySelector(LAYER);
    if (!layer) return;
    const spans = textSpans(layer);
    spans.forEach((s) => s.classList.remove("ra-hl-evidence", "ra-hl-highlight"));
    const texts = spans.map((s) => s.textContent ?? "");
    for (const h of highlights) {
      const r = findSpanRange(texts, h.text);
      if (!r) continue;
      for (let i = r[0]; i <= r[1]; i++) spans[i].classList.add(h.kind === "evidence" ? "ra-hl-evidence" : "ra-hl-highlight");
    }
  }, [textVersion, highlights]);

  // Flash the cited quote (from a candidate's citation chip).
  useEffect(() => {
    if (!flash?.quote || textVersion === 0) return;
    const layer = wrapRef.current?.querySelector(LAYER);
    if (!layer) return;
    const spans = textSpans(layer);
    const r = findSpanRange(spans.map((s) => s.textContent ?? ""), flash.quote);
    if (!r) return;
    const hit = spans.slice(r[0], r[1] + 1);
    hit.forEach((s) => { s.classList.remove("ra-flash"); void s.offsetWidth; s.classList.add("ra-flash"); });
    hit[0]?.scrollIntoView?.({ block: "center", behavior: "auto" });
    const t = setTimeout(() => hit.forEach((s) => s.classList.remove("ra-flash")), 2200);
    return () => clearTimeout(t);
  }, [flash?.nonce, flash?.quote, textVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={wrapRef} data-ra-page={pageNumber} className={styles.page} style={{ width, minHeight: height }}>
      {render ? (
        <Page
          pageNumber={pageNumber}
          width={width}
          renderTextLayer
          renderAnnotationLayer={false}
          onRenderTextLayerSuccess={onTextRendered}
          loading={placeholder}
        />
      ) : (
        <div className={styles.placeholder} style={{ width, height }} aria-hidden />
      )}
    </div>
  );
}

export function PdfViewer({ fileUrl }: { fileUrl: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { zoom, numPages } = useUiStore((s) => s.pdf);
  const setNumPages = useUiStore((s) => s.setNumPages);
  const setPdfPage = useUiStore((s) => s.setPdfPage);
  const setZoom = useUiStore((s) => s.setZoom);
  const scrollRequest = useUiStore((s) => s.scrollRequest);
  const highlights = useUiStore((s) => s.highlights);
  const hasSession = useSessionStore((s) => !!s.current);

  const [aspect, setAspect] = useState(1.294); // US-letter default until page 1 is measured
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visible, setVisible] = useState<number[]>([]);
  const ratios = useRef(new Map<number, number>());

  // The viewer owns numPages: clear it only when leaving (never racing its own load).
  useEffect(() => () => setNumPages(0), [setNumPages]);

  const width = Math.round((BASE_WIDTH * zoom) / 100);
  const height = Math.round(width * aspect);

  // One observer for all pages; tracks the visible set and the "current" page.
  const [io] = useState<IntersectionObserver | null>(() =>
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              const p = Number((e.target as HTMLElement).dataset.raPage);
              if (e.intersectionRatio > 0) ratios.current.set(p, e.intersectionRatio);
              else ratios.current.delete(p);
            }
            const pages = [...ratios.current.keys()].sort((a, b) => a - b);
            setVisible(pages);
            let best = -1, bestR = -1;
            for (const p of pages) if ((ratios.current.get(p) ?? 0) > bestR + 1e-6) { best = p; bestR = ratios.current.get(p)!; }
            if (best > 0) setPdfPage(best);
          },
          { threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] },
        ),
  );
  useEffect(() => () => io?.disconnect(), [io]);

  const renderSet = useMemo(() => {
    const s = new Set<number>();
    const seeds = visible.length ? visible : [1];
    for (const p of seeds) for (let d = -2; d <= 2; d++) if (p + d >= 1) s.add(p + d);
    return s;
  }, [visible]);

  const byPage = useMemo(() => {
    const m = new Map<number, Highlight[]>();
    for (const h of highlights) m.set(h.page, [...(m.get(h.page) ?? []), h]);
    return m;
  }, [highlights]);

  const fit = () => {
    const w = scrollerRef.current?.clientWidth ?? BASE_WIDTH;
    setZoom(((w - 48) / BASE_WIDTH) * 100);
  };

  // Keep reading position when zoom changes.
  const frac = useRef(0);
  const firstWidth = useRef(true);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (firstWidth.current) { firstWidth.current = false; return; }
    el.scrollTop = frac.current * el.scrollHeight;
  }, [width]);

  // scrollToPage requests (toolbar, citation chips).
  useEffect(() => {
    if (!scrollRequest) return;
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-ra-page="${scrollRequest.page}"]`);
    if (el && scrollerRef.current) scrollerRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 12), behavior: "auto" });
  }, [scrollRequest]);

  return (
    <div className={styles.pane}>
      <PdfToolbar onFit={fit} />
      <div
        ref={scrollerRef}
        className={styles.scroller}
        data-testid="pdf-scroller"
        onScroll={(e) => {
          const el = e.currentTarget;
          frac.current = el.scrollTop / Math.max(1, el.scrollHeight);
        }}
      >
        <Document
          file={fileUrl}
          className={styles.pages}
          onLoadSuccess={async (pdf) => {
            setLoadError(null);
            setNumPages(pdf.numPages);
            try {
              const vp = (await pdf.getPage(1)).getViewport({ scale: 1 });
              setAspect(vp.height / vp.width);
            } catch { /* keep default aspect */ }
            const w = scrollerRef.current?.clientWidth ?? BASE_WIDTH;
            if (w - 48 < BASE_WIDTH) setZoom(Math.max(50, ((w - 48) / BASE_WIDTH) * 100));
          }}
          onLoadError={() => setLoadError("The PDF could not be loaded.")}
          loading={<p className={styles.status}>Loading PDF…</p>}
          error={<p className={styles.status} role="alert">{loadError ?? "The PDF could not be loaded."}</p>}
          noData={<p className={styles.status}>No PDF to show.</p>}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
            <PageView
              key={p}
              pageNumber={p}
              width={width}
              height={height}
              render={renderSet.has(p)}
              highlights={byPage.get(p) ?? EMPTY}
              flash={scrollRequest && scrollRequest.page === p && scrollRequest.quote ? scrollRequest : null}
              io={io}
            />
          ))}
        </Document>
      </div>
      <SelectionContextMenu containerRef={scrollerRef} disabled={!hasSession} />
    </div>
  );
}
