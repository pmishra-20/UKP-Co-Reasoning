import { create } from "zustand";
import { api, ApiError } from "../api/client";
import type {
  DecisionRequest, ExpandRequest, ReviewItem, Role, Session, SessionSummary, Turn,
} from "../api/types";

type SaveState = "saved" | "saving" | "error";

const summarize = (s: Session): SessionSummary => ({
  id: s.id, title: s.title, venue: s.venue, role: s.role,
  num_turns: s.turns.length, updated_at: s.updated_at,
});
const sortSummaries = (l: SessionSummary[]) =>
  [...l].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");

interface SessionState {
  summaries: SessionSummary[];
  summariesLoaded: boolean;
  current: Session | null;
  loading: boolean;
  error: string | null;
  saveState: SaveState;
  expanding: boolean;
  pendingJudgment: string | null;
  expandError: string | null;
  lastRequest: ExpandRequest | null;

  loadSummaries: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  createSession: (documentId: string, venue: string, role: Role) => Promise<Session | null>;
  expand: (req: ExpandRequest) => Promise<Turn | null>;
  decide: (turnId: string, body: DecisionRequest) => Promise<void>;
  updateReview: (items: ReviewItem[]) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<boolean>;
}

export const useSessionStore = create<SessionState>((set, get) => {
  /** Apply a full Session from the server to both `current` and the sidebar summary. */
  const apply = (s: Session) => {
    const rest = get().summaries.filter((x) => x.id !== s.id);
    set({
      current: get().current?.id === s.id || !get().current ? s : get().current,
      summaries: sortSummaries([...rest, summarize(s)]),
    });
  };
  const tracked = async <T,>(fn: () => Promise<T>): Promise<T> => {
    set({ saveState: "saving" });
    try {
      const r = await fn();
      set({ saveState: "saved" });
      return r;
    } catch (e) {
      set({ saveState: "error" });
      throw e;
    }
  };

  return {
    summaries: [], summariesLoaded: false, current: null, loading: false, error: null,
    saveState: "saved", expanding: false, pendingJudgment: null, expandError: null, lastRequest: null,

    loadSummaries: async () => {
      try {
        set({ summaries: sortSummaries(await api.listSessions()), summariesLoaded: true });
      } catch (e) {
        set({ error: msg(e), summariesLoaded: true });
      }
    },

    loadSession: async (id) => {
      set({ loading: true, error: null, expandError: null, current: get().current?.id === id ? get().current : null });
      try {
        const s = await api.getSession(id);
        set({ current: s, loading: false });
      } catch (e) {
        set({ error: msg(e), loading: false, current: null });
      }
    },

    createSession: async (documentId, venue, role) => {
      try {
        const s = await tracked(() => api.createSession(documentId, venue, role));
        set({ current: s, summaries: sortSummaries([...get().summaries, summarize(s)]) });
        return s;
      } catch (e) {
        set({ error: msg(e) });
        return null;
      }
    },

    expand: async (req) => {
      const cur = get().current;
      if (!cur || get().expanding) return null;
      set({ expanding: true, pendingJudgment: req.judgment, expandError: null, lastRequest: req });
      try {
        const turn = await api.expand(cur.id, req);
        const s = get().current;
        if (s && s.id === cur.id) {
          const updated: Session = { ...s, turns: [...s.turns, turn], updated_at: turn.created_at };
          set({ current: updated });
          apply(updated);
        }
        set({ expanding: false, pendingJudgment: null });
        return turn;
      } catch (e) {
        set({ expanding: false, pendingJudgment: null, expandError: msg(e) });
        return null;
      }
    },

    decide: async (turnId, body) => {
      const cur = get().current;
      if (!cur) return;
      try {
        apply(await tracked(() => api.decide(cur.id, turnId, body)));
      } catch (e) {
        set({ error: msg(e) });
      }
    },

    updateReview: async (items) => {
      const cur = get().current;
      if (!cur) return;
      set({ current: { ...cur, review: items } }); // optimistic
      try {
        const s = await tracked(() => api.putReview(cur.id, items));
        if (get().current?.id === s.id) set({ current: s });
        apply(s);
      } catch (e) {
        set({ error: msg(e) });
      }
    },

    rename: async (id, title) => {
      try {
        const s = await tracked(() => api.renameSession(id, title));
        if (get().current?.id === id) set({ current: s });
        apply(s);
      } catch (e) {
        set({ error: msg(e) });
      }
    },

    remove: async (id) => {
      try {
        await tracked(() => api.deleteSession(id));
        set({
          summaries: get().summaries.filter((s) => s.id !== id),
          current: get().current?.id === id ? null : get().current,
        });
        return true;
      } catch (e) {
        set({ error: msg(e) });
        return false;
      }
    },
  };
});
