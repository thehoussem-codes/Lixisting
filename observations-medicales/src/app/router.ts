/** Routeur minimal : fragment d'URL (#/…), ou en mémoire dans la version autonome. */
import { useSyncExternalStore } from 'react';

const MEMOIRE = import.meta.env.VITE_LOCAL === '1';
let chemin = '/';
const abonnes = new Set<() => void>();

function current(): string {
  if (MEMOIRE) return chemin;
  return window.location.hash.replace(/^#/, '') || '/';
}

function subscribe(cb: () => void) {
  if (MEMOIRE) { abonnes.add(cb); return () => { abonnes.delete(cb); }; }
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute(): string[] {
  const path = useSyncExternalStore(subscribe, current, () => '/');
  return path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string) {
  if (current() === path) return;
  if (MEMOIRE) {
    chemin = path;
    abonnes.forEach((f) => f());
    document.querySelector('.main')?.scrollTo?.({ top: 0 });
    return;
  }
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}

/** En mode mémoire, les liens internes (#/…) sont interceptés. */
if (MEMOIRE && typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    const a = (e.target as HTMLElement).closest?.('a');
    const h = a?.getAttribute('href');
    if (a && h && h.startsWith('#/')) { e.preventDefault(); navigate(h.slice(1)); }
  });
}
