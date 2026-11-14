/** Contextes globaux : session utilisateur, observation en cours, notifications. */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Draft } from 'immer';
import type { Observation, UserInfo } from '../../shared/types.ts';
import type { ObsStore } from './store.ts';

/* ---------------- Session ---------------- */
export interface Session {
  user: UserInfo;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  canEdit: boolean;
  canValidate: boolean;
}
export const SessionCtx = createContext<Session | null>(null);
export function useSession(): Session {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('Session absente');
  return s;
}

/* ---------------- Observation ---------------- */
export interface ObsCtxValue {
  store: ObsStore;
  data: Observation;
  update: (fn: (d: Draft<Observation>) => void) => void;
  readOnly: boolean;
}
export const ObsCtx = createContext<ObsCtxValue | null>(null);
export function useObs(): ObsCtxValue {
  const v = useContext(ObsCtx);
  if (!v) throw new Error('Observation absente');
  return v;
}

/* ---------------- Notifications ---------------- */
interface Toast {
  id: number;
  text: string;
  err?: boolean;
}
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});
export function useToast() {
  return useContext(ToastCtx);
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, err = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-zone" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Thème ---------------- */
export function getTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem('obs-theme');
    if (t === 'dark' || t === 'light') return t;
  } catch { /* stockage indisponible */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(t: 'light' | 'dark') {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('obs-theme', t); } catch { /* ignoré */ }
}
