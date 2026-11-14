/** Client HTTP de l'API (même origine, cookie de session HttpOnly, en-tête anti-CSRF). */

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type Listener = () => void;
const unauthListeners = new Set<Listener>();
export function onUnauthorized(l: Listener) {
  unauthListeners.add(l);
  return () => unauthListeners.delete(l);
}

export const MODE_LOCAL = import.meta.env.VITE_LOCAL === '1';

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (MODE_LOCAL) {
    const { localApi } = await import('./localApi.ts');
    try {
      return await localApi<T>(path, opts.method ?? 'GET', opts.body);
    } catch (e) {
      const x = e as Error & { status?: number };
      throw new ApiError(x.status ?? 500, x.message);
    }
  }
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'observations',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* réponse vide */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) unauthListeners.forEach((l) => l());
    throw new ApiError(res.status, String(data.error ?? `Erreur ${res.status}`), data);
  }
  return data as T;
}
