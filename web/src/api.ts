// Thin fetch wrapper that attaches credentials, parses JSON, and throws on non-2xx
const API_URL = import.meta.env.VITE_API_URL || "/api";

export async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include"
  });
  const data = await res.json().catch(() => ({}));
  
  if (!res.ok) {
    const error = new Error(data.message || `Request failed with status ${res.status}`);
    (error as any).status = res.status;
    throw error;
  }
  return data;
}
