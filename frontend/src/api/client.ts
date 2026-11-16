import type {
  DecisionRequest, DocumentMeta, ExpandRequest, ProviderInfo, ReviewItem, Role, Session,
  SessionSummary, Turn,
} from "./types";

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api" + path, {
      ...init,
      headers: init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", "network_error", 0);
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    let code = "http_error";
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      if (typeof body.code === "string") code = body.code;
    } catch { /* non-JSON error body */ }
    throw new ApiError(detail, code, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  providers: () => request<ProviderInfo[]>("/providers"),

  /** Uses XHR (not fetch) so the Dropzone can show upload progress. */
  uploadDocument(file: File, onProgress?: (fraction: number) => void): Promise<DocumentMeta> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/documents");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onerror = () => reject(new ApiError("Cannot reach the server. Is the backend running?", "network_error", 0));
      xhr.onload = () => {
        let body: { detail?: string; code?: string } & Partial<DocumentMeta> = {};
        try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as DocumentMeta);
        else reject(new ApiError(body.detail ?? `Upload failed (${xhr.status})`, body.code ?? "http_error", xhr.status));
      };
      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    });
  },
  documentUrl: (id: string) => `/api/documents/${id}/file`,

  listSessions: () => request<SessionSummary[]>("/sessions"),
  createSession: (document_id: string, venue: string, role: Role) =>
    request<Session>("/sessions", json("POST", { document_id, venue, role })),
  getSession: (id: string) => request<Session>(`/sessions/${id}`),
  renameSession: (id: string, title: string) => request<Session>(`/sessions/${id}`, json("PATCH", { title })),
  deleteSession: (id: string) => request<void>(`/sessions/${id}`, { method: "DELETE" }),
  expand: (id: string, body: ExpandRequest) => request<Turn>(`/sessions/${id}/expand`, json("POST", body)),
  decide: (id: string, turnId: string, body: DecisionRequest) =>
    request<Session>(`/sessions/${id}/turns/${turnId}/decision`, json("POST", body)),
  putReview: (id: string, items: ReviewItem[]) => request<Session>(`/sessions/${id}/review`, json("PUT", { items })),
};
