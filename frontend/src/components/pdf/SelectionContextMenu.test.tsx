import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUiStore } from "../../store/uiStore";
import { SelectionContextMenu } from "./SelectionContextMenu";

function Host({ disabled = false }: { disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={ref}>
        <div data-ra-page="3">
          <div className="textLayer"><span id="sel">The evaluation omits a strong baseline</span></div>
        </div>
        <p id="outside">not in the pdf</p>
      </div>
      <textarea aria-label="composer" />
      <SelectionContextMenu containerRef={ref} disabled={disabled} />
    </>
  );
}

function select(id: string) {
  const node = document.getElementById(id)!.firstChild!;
  const r = document.createRange();
  r.setStart(node, 0);
  r.setEnd(node, node.textContent!.length);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
  useUiStore.setState({ attachments: [], highlights: [], composerText: "", composerSel: [0, 0], focusNonce: 0 });
});

describe("SelectionContextMenu (Req. 1)", () => {
  it("opens only when text inside the PDF text layer is selected", () => {
    render(<Host />);
    // no selection → native menu (event not prevented, no custom menu)
    const notPrevented = fireEvent.contextMenu(document.getElementById("sel")!);
    expect(notPrevented).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();

    // selection outside the text layer → native menu
    select("outside");
    expect(fireEvent.contextMenu(document.getElementById("outside")!)).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();

    // selection inside the text layer → custom menu, native one suppressed
    select("sel");
    expect(fireEvent.contextMenu(document.getElementById("sel")!)).toBe(false);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("6 words selected · p. 3")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
  });

  it("closes on Escape", () => {
    render(<Host />);
    select("sel");
    fireEvent.contextMenu(document.getElementById("sel")!);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("E adds the selection as evidence (attachment + highlight)", () => {
    render(<Host />);
    select("sel");
    fireEvent.contextMenu(document.getElementById("sel")!);
    fireEvent.keyDown(document, { key: "e" });
    const { attachments, highlights } = useUiStore.getState();
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ kind: "evidence", page: 3, text: "The evaluation omits a strong baseline" });
    expect(highlights[0]).toMatchObject({ page: 3, kind: "evidence" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("S inserts a quoted snippet at the caret and J starts a judgment", () => {
    render(<Host />);
    useUiStore.setState({ composerText: "Hello world", composerSel: [5, 5] });
    select("sel");
    fireEvent.contextMenu(document.getElementById("sel")!);
    fireEvent.keyDown(document, { key: "s" });
    const st = useUiStore.getState();
    expect(st.composerText).toBe("Hello“The evaluation omits a strong baseline” (p. 3) world");
    expect(st.attachments[0].kind).toBe("snippet");

    select("sel");
    fireEvent.contextMenu(document.getElementById("sel")!);
    fireEvent.keyDown(document, { key: "j" });
    expect(useUiStore.getState().composerText).toBe("");
    expect(useUiStore.getState().attachments.some((a) => a.kind === "evidence")).toBe(true);
  });

  it("Highlight adds a highlight without an attachment; click on item works", () => {
    render(<Host />);
    select("sel");
    fireEvent.contextMenu(document.getElementById("sel")!);
    fireEvent.click(screen.getByRole("menuitem", { name: /Highlight/ }));
    expect(useUiStore.getState().attachments).toHaveLength(0);
    expect(useUiStore.getState().highlights[0].kind).toBe("highlight");
  });

  it("items are disabled without an active session", () => {
    render(<Host disabled />);
    select("sel");
    fireEvent.contextMenu(document.getElementById("sel")!);
    screen.getAllByRole("menuitem").forEach((i) => expect(i).toBeDisabled());
    fireEvent.keyDown(document, { key: "e" });
    expect(useUiStore.getState().attachments).toHaveLength(0);
  });
});
