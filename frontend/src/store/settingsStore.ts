import { create } from "zustand";
import { api } from "../api/client";
import type { GenerationParams, ProviderInfo } from "../api/types";
import { readJson, writeJson } from "../lib/storage";

export const DEFAULT_PARAMS: GenerationParams = {
  verbosity: "balanced",
  num_candidates: 3,
  temperature: 0.8,
  max_tokens: null,
};

interface Persisted { providerId: string | null; model: string | null; params: GenerationParams }

interface SettingsState extends Persisted {
  providers: ProviderInfo[];
  providersLoaded: boolean;
  loadProviders: () => Promise<void>;
  setProvider: (id: string) => void;
  setModel: (model: string) => void;
  setParams: (p: Partial<GenerationParams>) => void;
  reset: () => void;
}

const stored = readJson<Partial<Persisted>>("ra.settings", {});
const persist = (s: Persisted) =>
  writeJson("ra.settings", { providerId: s.providerId, model: s.model, params: s.params });

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providerId: stored.providerId ?? null,
  model: stored.model ?? null,
  params: { ...DEFAULT_PARAMS, ...(stored.params ?? {}) },
  providers: [],
  providersLoaded: false,

  loadProviders: async () => {
    try {
      const providers = await api.providers();
      const cur = providers.find((p) => p.id === get().providerId && p.available);
      const fallback = providers.find((p) => p.is_default && p.available) ?? providers.find((p) => p.available);
      const chosen = cur ?? fallback;
      const model = chosen && get().model && chosen.models.includes(get().model!) ? get().model : chosen?.default_model ?? null;
      set({ providers, providersLoaded: true, providerId: chosen?.id ?? null, model });
      persist(get());
    } catch {
      set({ providersLoaded: true });
    }
  },
  setProvider: (id) => {
    const p = get().providers.find((x) => x.id === id);
    if (!p || !p.available) return;
    set({ providerId: id, model: p.default_model });
    persist(get());
  },
  setModel: (model) => { set({ model }); persist(get()); },
  setParams: (p) => { set({ params: { ...get().params, ...p } }); persist(get()); },
  reset: () => {
    const def = get().providers.find((p) => p.is_default && p.available) ?? get().providers.find((p) => p.available);
    set({ params: { ...DEFAULT_PARAMS }, providerId: def?.id ?? get().providerId, model: def?.default_model ?? get().model });
    persist(get());
  },
}));
